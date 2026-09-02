import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pDepositIntentEntity } from "../entity/p2p-deposit-intent.entity";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import { P2pPaymentProofEntity } from "../entity/p2p-payment-proof.entity";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import { P2pWithdrawRequestEntity } from "../entity/p2p-withdraw-request.entity";
import {
  P2pEscalationReasonEnum,
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
} from "../enum/p2p.enums";
import {
  assertIntentTransition,
  assertMatchTransition,
  assertPartTransition,
} from "../state/transitions";
import { P2pMatchingService } from "./p2p-matching.service";
import { P2pSettingService } from "./p2p-setting.service";
import { P2pEscalationService } from "./p2p-escalation.service";
import { P2pAuditService, AuditContext } from "./p2p-audit.service";
import { SubmitPaymentProofDto } from "../dto/submit-payment-proof.dto";
import { DepositEntity } from "../../deposit/deposit.entity";
import { DepositStatusEnum } from "../../deposit/enum/deposit-status.enum";
import { MinioService } from "../../minio/minio.service";
import { OcrService } from "../../ocr/ocr.service";
import { P2pEvents } from "../../shared/constants/events.constants";

/** A receipt whose amount is off by more than this is treated as a mismatch. */
const AMOUNT_TOLERANCE = 1;

@Injectable()
export class P2pDepositService {
  private readonly logger = new Logger(P2pDepositService.name);

  constructor(
    @InjectRepository(P2pDepositIntentEntity)
    private readonly intentRepo: Repository<P2pDepositIntentEntity>,
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(P2pPaymentProofEntity)
    private readonly proofRepo: Repository<P2pPaymentProofEntity>,
    private readonly dataSource: DataSource,
    private readonly matching: P2pMatchingService,
    private readonly settings: P2pSettingService,
    private readonly escalations: P2pEscalationService,
    private readonly audit: P2pAuditService,
    private readonly minio: MinioService,
    private readonly ocr: OcrService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Creates the intent for an already-persisted `deposit` row and matches it. */
  async createForDeposit(
    deposit: DepositEntity,
    constraints: Record<string, any> | undefined,
    ctx: AuditContext,
  ): Promise<P2pDepositIntentEntity> {
    const settings = await this.settings.get();

    const intent = await this.intentRepo.save(
      this.intentRepo.create({
        depositId: deposit.id,
        userId: deposit.userId,
        symbolId: deposit.symbolId,
        requestedAmount: Number(deposit.amount),
        constraintsJson: constraints ?? null,
        state: P2pIntentStateEnum.CREATED,
        expiresAt: new Date(Date.now() + settings.requestExpiryHours * 3600_000),
      }),
    );

    await this.audit.record(ctx, "p2p.intent_created", "p2p_deposit_intent", intent.id, null, {
      amount: Number(deposit.amount),
    });

    // Matching runs inline so the user sees a destination immediately when
    // liquidity exists; when it does not, the retry worker picks it up.
    await this.matching.reserveForIntent(intent.id);
    return this.intentRepo.findOne({ where: { id: intent.id } });
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.intentRepo.findAndCount({
      where: { userId },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  /**
   * The live match for an intent. Throws 404 while the intent is still queued,
   * which is the signal the user panel renders as "still searching".
   */
  async getMatch(userId: string, intentId: string): Promise<P2pMatchEntity> {
    const intent = await this.intentRepo.findOne({
      where: [{ id: intentId }, { depositId: intentId }],
    });
    if (!intent) throw new NotFoundException("Deposit intent not found");
    if (intent.userId !== userId) throw new ForbiddenException("Access denied");

    const match = await this.matchRepo.findOne({
      where: { depositIntentId: intent.id },
      relations: { paymentProof: true },
      order: { createAt: "DESC" },
    });
    if (!match || this.isDead(match.status)) {
      throw new NotFoundException("No active match for this deposit intent yet");
    }
    return match;
  }

  /** Moves a reservation to AWAITING_PAYMENT once the depositor commits to it. */
  async acceptMatch(userId: string, matchId: string, ctx: AuditContext) {
    return this.dataSource.transaction(async (manager) => {
      const { match } = await this.loadOwnedMatch(manager, userId, matchId);
      if (match.status === P2pMatchStatusEnum.AWAITING_PAYMENT) return match;

      assertMatchTransition(match.status, P2pMatchStatusEnum.AWAITING_PAYMENT);
      match.status = P2pMatchStatusEnum.AWAITING_PAYMENT;
      await manager.save(match);

      const intent = await manager.findOne(P2pDepositIntentEntity, {
        where: { id: match.depositIntentId },
      });
      assertIntentTransition(intent.state, P2pIntentStateEnum.AWAITING_PAYMENT);
      intent.state = P2pIntentStateEnum.AWAITING_PAYMENT;
      await manager.save(intent);

      await this.audit.record(ctx, "p2p.match_accepted", "p2p_match", match.id, null, null, manager);
      return match;
    });
  }

  /** Releases the reservation and puts the part back into the pool. */
  async cancelMatch(userId: string, matchId: string, ctx: AuditContext) {
    return this.dataSource.transaction(async (manager) => {
      const { match, intent } = await this.loadOwnedMatch(manager, userId, matchId);

      assertMatchTransition(match.status, P2pMatchStatusEnum.CANCELLED);
      match.status = P2pMatchStatusEnum.CANCELLED;
      await manager.save(match);

      await this.releasePart(manager, match.withdrawPartId);

      assertIntentTransition(intent.state, P2pIntentStateEnum.MATCHING);
      intent.state = P2pIntentStateEnum.MATCHING;
      await manager.save(intent);

      await this.audit.record(ctx, "p2p.match_cancelled", "p2p_match", match.id, null, null, manager);
      return match;
    });
  }

  /**
   * Records the depositor's receipt and hands the match to the withdrawer.
   *
   * Idempotent by key: a re-submitted receipt returns the first proof rather
   * than creating a second, so a double-tap cannot look like two payments.
   */
  async submitPaymentProof(
    userId: string,
    matchId: string,
    dto: SubmitPaymentProofDto,
    file: Express.Multer.File | undefined,
    idempotencyKey: string | undefined,
    ctx: AuditContext,
  ) {
    const key = idempotencyKey ?? `proof-${matchId}`;

    // Idempotent on the match itself, not just the key: a client that retries
    // without the header, or with a fresh one, must still get the first proof
    // back rather than an illegal-transition error.
    const existing =
      (await this.proofRepo.findOne({ where: { idempotencyKey: key } })) ??
      (await this.proofRepo.findOne({ where: { matchId } }));
    if (existing) return existing;

    const settings = await this.settings.get();

    // The upload and OCR happen outside the transaction — they are slow, and
    // an OCR outage must not block a genuine payment from being recorded.
    let receiptObjectName: string | undefined;
    let ocrResult: any = null;
    if (file) {
      const objectName = `p2p/${matchId}/${Date.now()}-${file.originalname}`;
      const uploaded = await this.minio.uploadFile(
        {
          objectName,
          stream: file.buffer,
          size: file.size,
          contentType: file.mimetype,
          metadata: { matchId, uploadedBy: "depositor", originalName: file.originalname },
        },
        "p2p",
      );
      receiptObjectName = uploaded?.name ?? objectName;
      try {
        ocrResult = await this.ocr.processImage(file.buffer.toString("base64"));
      } catch (err) {
        this.logger.warn(`OCR failed for p2p proof on match ${matchId}: ${(err as Error).message}`);
      }
    }

    const { proof, mismatch, withdrawUserId, deadline } = await this.dataSource.transaction(async (manager) => {
      const { match, intent } = await this.loadOwnedMatch(manager, userId, matchId);

      const ocrAmount = Number(ocrResult?.parsed?.amount ?? NaN);
      const claimed = Number(dto.amount);
      // Either the depositor's own figure or the receipt's disagreeing with
      // the match is a mismatch — both mean an admin should look.
      const amountMismatch =
        Math.abs(claimed - Number(match.amount)) > AMOUNT_TOLERANCE ||
        (Number.isFinite(ocrAmount) &&
          Math.abs(ocrAmount - Number(match.amount)) > AMOUNT_TOLERANCE);

      const saved = await manager.save(
        manager.create(P2pPaymentProofEntity, {
          matchId: match.id,
          amount: claimed,
          sourceAccount: dto.sourceAccount ?? null,
          destinationAccount:
            dto.destinationAccount ?? match.destinationSnapshotJson?.iban ?? null,
          trackingCode: dto.trackingCode ?? null,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          receiptObjectName: receiptObjectName ?? null,
          ocrResultJson: ocrResult,
          ocrMismatch: amountMismatch,
          idempotencyKey: key,
          submittedAt: new Date(),
        }),
      );

      assertMatchTransition(match.status, P2pMatchStatusEnum.PROOF_SUBMITTED);
      match.status = P2pMatchStatusEnum.PROOF_SUBMITTED;
      await manager.save(match);

      assertIntentTransition(intent.state, P2pIntentStateEnum.PAYMENT_PROOF_SUBMITTED);
      intent.state = P2pIntentStateEnum.PAYMENT_PROOF_SUBMITTED;
      await manager.save(intent);

      // Resolve the withdrawer here, while the part is already loaded — the
      // notification listener should not have to go looking.
      let withdrawer: string | undefined;
      if (match.withdrawPartId) {
        const part = await manager.findOne(P2pWithdrawPartEntity, {
          where: { id: match.withdrawPartId },
          lock: { mode: "pessimistic_write" },
        });
        if (part) {
          assertPartTransition(part.status, P2pPartStatusEnum.PAID_PENDING);
          part.status = P2pPartStatusEnum.PAID_PENDING;
          await manager.save(part);

          const request = await manager.findOne(P2pWithdrawRequestEntity, {
            where: { id: part.withdrawRequestId },
          });
          withdrawer = request?.userId;
        }
      }

      if (!amountMismatch) {
        // Hand it to the withdrawer with a response clock running.
        assertMatchTransition(match.status, P2pMatchStatusEnum.WAITING_CONFIRMATION);
        match.status = P2pMatchStatusEnum.WAITING_CONFIRMATION;
        match.responseDeadlineAt = new Date(
          Date.now() + settings.withdrawerResponseTimeoutMinutes * 60_000,
        );
        await manager.save(match);

        assertIntentTransition(intent.state, P2pIntentStateEnum.WAITING_WITHDRAWER_CONFIRMATION);
        intent.state = P2pIntentStateEnum.WAITING_WITHDRAWER_CONFIRMATION;
        await manager.save(intent);
      }

      await manager.update(DepositEntity, { id: intent.depositId }, {
        status: DepositStatusEnum.PROCESSING,
      });

      await this.audit.record(
        ctx,
        "p2p.proof_submitted",
        "p2p_payment_proof",
        saved.id,
        null,
        { matchId: match.id, amount: claimed, ocrMismatch: amountMismatch },
        manager,
      );

      return {
        proof: saved,
        mismatch: amountMismatch,
        withdrawUserId: withdrawer,
        deadline: match.responseDeadlineAt,
      };
    });

    if (mismatch) {
      // The payment is still recorded — an admin decides, the system does not
      // silently reject a receipt whose numbers look off.
      await this.escalations.open(matchId, P2pEscalationReasonEnum.RECEIPT_MISMATCH, {
        priority: 2,
        note: "Receipt amount does not match the reserved amount",
      });
    } else {
      this.eventEmitter.emit(P2pEvents.PROOF_SUBMITTED, {
        matchId,
        proofId: proof.id,
        depositUserId: userId,
        withdrawUserId,
        amount: Number(dto.amount),
        responseDeadlineAt: deadline,
      });
    }
    return proof;
  }

  /** Presigned so a receipt is never a permanently public URL. */
  async getReceiptUrl(objectName: string): Promise<string> {
    return this.minio.getPresignedUrl({ objectName, expires: 300 });
  }

  // ─── Internals ─────────────────────────────────────────────

  private isDead(status: P2pMatchStatusEnum): boolean {
    return [
      P2pMatchStatusEnum.CANCELLED,
      P2pMatchStatusEnum.RESERVATION_EXPIRED,
    ].includes(status);
  }

  private async loadOwnedMatch(manager: any, userId: string, matchId: string) {
    const match = await manager.findOne(P2pMatchEntity, {
      where: { id: matchId },
      lock: { mode: "pessimistic_write" },
    });
    if (!match) throw new NotFoundException("Match not found");

    const intent = await manager.findOne(P2pDepositIntentEntity, {
      where: { id: match.depositIntentId },
    });
    if (!intent) throw new NotFoundException("Deposit intent not found");
    if (intent.userId !== userId) throw new ForbiddenException("Access denied");

    return { match, intent };
  }

  async releasePart(manager: any, partId?: string): Promise<void> {
    if (!partId) return;
    const part = await manager.findOne(P2pWithdrawPartEntity, {
      where: { id: partId },
      lock: { mode: "pessimistic_write" },
    });
    if (!part || part.status === P2pPartStatusEnum.CONFIRMED) return;

    assertPartTransition(part.status, P2pPartStatusEnum.OPEN);
    part.status = P2pPartStatusEnum.OPEN;
    part.activeReservationId = null;
    part.reservedUntil = null;
    await manager.save(part);
  }
}
