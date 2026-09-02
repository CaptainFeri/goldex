import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pWithdrawRequestEntity } from "../entity/p2p-withdraw-request.entity";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import { P2pDepositIntentEntity } from "../entity/p2p-deposit-intent.entity";
import {
  P2pEscalationReasonEnum,
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pSplitPolicyEnum,
  P2pWithdrawStateEnum,
} from "../enum/p2p.enums";
import {
  assertIntentTransition,
  assertMatchTransition,
  assertPartTransition,
  assertWithdrawTransition,
} from "../state/transitions";
import { CreateP2pWithdrawDto } from "../dto/create-p2p-withdraw.dto";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { WithdrawEntity } from "../../withdraw/withdraw.entity";
import { WithdrawStatusEnum } from "../../withdraw/enum/withdraw-status.enum";
import { UserBankAccountEntity } from "../../user/entity/user.bank.account.entity";
import { P2pSettingService } from "./p2p-setting.service";
import { P2pSettlementService } from "./p2p-settlement.service";
import { P2pEscalationService } from "./p2p-escalation.service";
import { P2pAuditService, AuditContext } from "./p2p-audit.service";
import { P2pEvents } from "../../shared/constants/events.constants";

const round8 = (n: number) => Number(n.toFixed(8));

@Injectable()
export class P2pWithdrawService {
  private readonly logger = new Logger(P2pWithdrawService.name);

  constructor(
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly requestRepo: Repository<P2pWithdrawRequestEntity>,
    @InjectRepository(P2pWithdrawPartEntity)
    private readonly partRepo: Repository<P2pWithdrawPartEntity>,
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(UserBankAccountEntity)
    private readonly bankRepo: Repository<UserBankAccountEntity>,
    private readonly dataSource: DataSource,
    private readonly settings: P2pSettingService,
    private readonly settlement: P2pSettlementService,
    private readonly escalations: P2pEscalationService,
    private readonly audit: P2pAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Creates the p2p detail for an already-persisted `withdraw` row, generates
   * its parts, and locks the withdrawer's balance.
   *
   * The lock is the reason p2p cannot reuse the plain withdraw flow: that one
   * only deducts on COMPLETED, which would let a withdrawer spend the rial
   * while depositors are paying real money against the promise of it.
   */
  async createForWithdraw(
    withdraw: WithdrawEntity,
    dto: CreateP2pWithdrawDto,
    ctx: AuditContext,
  ): Promise<P2pWithdrawRequestEntity> {
    const total = Number(withdraw.amount);
    const split = dto.split ?? { policy: P2pSplitPolicyEnum.EXACT, parts: 1 };
    const partCount = this.resolvePartCount(split, total, dto);

    // Depositors pay into a verified account in the withdrawer's own name.
    const bank = await this.bankRepo.findOne({ where: { userId: withdraw.userId } });
    if (!bank || !bank.verifiedAt) {
      throw new BadRequestException(
        "برای برداشت همتا به همتا ابتدا حساب بانکی خود را ثبت و تأیید کنید",
      );
    }

    const settings = await this.settings.get();

    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager.findOne(WalletEntity, {
        where: {
          userId: withdraw.userId,
          symbolId: withdraw.symbolId,
          walletType: WalletTypeEnum.DEPOSIT,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!wallet) throw new BadRequestException("User does not have a wallet for this symbol");
      if (Number(wallet.freeBalance) < total) {
        throw new BadRequestException("موجودی آزاد برای این برداشت کافی نیست");
      }

      wallet.freeBalance = round8(Number(wallet.freeBalance) - total);
      wallet.lockedBalance = round8(Number(wallet.lockedBalance) + total);
      await manager.save(wallet);

      const request = await manager.save(
        manager.create(P2pWithdrawRequestEntity, {
          withdrawId: withdraw.id,
          userId: withdraw.userId,
          symbolId: withdraw.symbolId,
          totalAmount: total,
          completedAmount: 0,
          remainingAmount: total,
          lockedAmount: total,
          splitPolicy: split.policy,
          requiredParts: split.policy === P2pSplitPolicyEnum.EXACT ? partCount : null,
          minParts: split.minParts ?? null,
          maxParts: split.maxParts ?? null,
          minPartAmount: dto.constraints?.minPart ?? null,
          maxPartAmount: dto.constraints?.maxPart ?? null,
          preferredBank: dto.constraints?.preferredBank ?? null,
          freeConditions: dto.constraints?.notes ?? null,
          destinationBankAccountId: bank.id,
          destinationSnapshotJson: {
            bankName: bank.bankName,
            iban: bank.iban,
            accountNumber: bank.depositNumber,
            ownerName: withdraw.user
              ? `${withdraw.user.firstName ?? ""} ${withdraw.user.lastName ?? ""}`.trim()
              : undefined,
          },
          state: P2pWithdrawStateEnum.PENDING_MATCHING,
          expiresAt: new Date(Date.now() + settings.requestExpiryHours * 3600_000),
        }),
      );

      for (const [index, amount] of this.splitAmounts(total, partCount).entries()) {
        await manager.save(
          manager.create(P2pWithdrawPartEntity, {
            withdrawRequestId: request.id,
            sequenceNo: index + 1,
            targetAmount: amount,
            status: P2pPartStatusEnum.OPEN,
          }),
        );
      }

      await manager.save(
        manager.create(TransactionEntity, {
          walletId: wallet.id,
          transactionId: `P2PLCK-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
          transactionType: TransactionTypeEnum.P2P_WITHDRAW_LOCK,
          status: TransactionStatusEnum.COMPLETED,
          amount: -total,
          description: "p2p withdrawal balance locked",
          metadata: { withdrawId: withdraw.id, withdrawRequestId: request.id },
          completedAt: new Date(),
        }),
      );

      await manager.update(WithdrawEntity, { id: withdraw.id }, {
        status: WithdrawStatusEnum.PROCESSING,
      });

      await this.audit.record(
        ctx,
        "p2p.withdraw_created",
        "p2p_withdraw_request",
        request.id,
        null,
        { total, partCount, splitPolicy: split.policy },
        manager,
      );

      this.logger.log(`p2p withdrawal ${request.id} created: ${total} in ${partCount} part(s)`);
      return request;
    });
  }

  // ─── Reads ─────────────────────────────────────────────────

  async listByUser(userId: string, page = 1, limit = 20) {
    const [items, total] = await this.requestRepo.findAndCount({
      where: { userId },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async listParts(userId: string, withdrawId: string) {
    const request = await this.requestRepo.findOne({
      where: [{ withdrawId }, { id: withdrawId }],
    });
    if (!request) throw new NotFoundException("Withdrawal request not found");
    if (request.userId !== userId) throw new ForbiddenException("Access denied");

    const parts = await this.partRepo.find({
      where: { withdrawRequestId: request.id },
      order: { sequenceNo: "ASC" },
    });

    // Attach the live match (and its proof) so the withdrawer can see what they
    // are being asked to confirm without a second round-trip per part.
    const matches = await this.matchRepo.find({
      where: parts.map((p) => ({ withdrawPartId: p.id })),
      relations: { paymentProof: true },
      order: { createAt: "DESC" },
    });

    return parts.map((part) => ({
      ...part,
      match: matches.find(
        (m) => m.withdrawPartId === part.id && m.status !== P2pMatchStatusEnum.RESERVATION_EXPIRED,
      ) ?? null,
    }));
  }

  // ─── Withdrawer decisions ──────────────────────────────────

  async confirmPayment(userId: string, partId: string, ctx: AuditContext) {
    return this.dataSource.transaction(async (manager) => {
      const { part, match } = await this.loadAwaitingMatch(manager, userId, partId);
      await this.settlement.settle(manager, match.id, ctx);
      return { partId: part.id, matchId: match.id, status: P2pMatchStatusEnum.CONFIRMED };
    });
  }

  /**
   * A rejection never closes the case — it always opens an escalation, because
   * the depositor may well have paid (spec §3.3).
   */
  async rejectPayment(userId: string, partId: string, reason: string, ctx: AuditContext) {
    const { matchId } = await this.dataSource.transaction(async (manager) => {
      const { part, match, intent } = await this.loadAwaitingMatch(manager, userId, partId);

      assertMatchTransition(match.status, P2pMatchStatusEnum.REJECTED_BY_WITHDRAWER);
      match.status = P2pMatchStatusEnum.REJECTED_BY_WITHDRAWER;
      await manager.save(match);

      assertIntentTransition(intent.state, P2pIntentStateEnum.REJECTED_BY_WITHDRAWER);
      intent.state = P2pIntentStateEnum.REJECTED_BY_WITHDRAWER;
      await manager.save(intent);

      await this.audit.record(
        ctx,
        "p2p.withdrawer_reject",
        "p2p_match",
        match.id,
        { status: P2pMatchStatusEnum.WAITING_CONFIRMATION },
        { status: match.status, reason },
        manager,
      );

      this.eventEmitter.emit(P2pEvents.REJECTED, {
        matchId: match.id,
        depositUserId: intent.userId,
        reason,
      });
      return { matchId: match.id, partId: part.id };
    });

    // Escalation is opened outside the transaction so a notification failure
    // cannot roll back the rejection the user already saw succeed.
    await this.escalations.open(matchId, P2pEscalationReasonEnum.WITHDRAWER_REJECT, {
      priority: 1,
      note: reason,
    });
    return { matchId, status: P2pMatchStatusEnum.REJECTED_BY_WITHDRAWER };
  }

  // ─── Cancellation and expiry ───────────────────────────────

  /** Allowed only while nothing is reserved — someone may already be paying. */
  async cancel(userId: string, withdrawId: string, ctx: AuditContext) {
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(P2pWithdrawRequestEntity, {
        where: [{ withdrawId }, { id: withdrawId }],
        lock: { mode: "pessimistic_write" },
      });
      if (!request) throw new NotFoundException("Withdrawal request not found");
      if (request.userId !== userId) throw new ForbiddenException("Access denied");

      const busy = await manager.count(P2pWithdrawPartEntity, {
        where: [
          { withdrawRequestId: request.id, status: P2pPartStatusEnum.RESERVED },
          { withdrawRequestId: request.id, status: P2pPartStatusEnum.PAID_PENDING },
        ],
      });
      if (busy > 0) {
        throw new BadRequestException(
          "این درخواست در حال تسویه است و تا پایان بخش‌های رزروشده قابل لغو نیست",
        );
      }

      await this.closeRequest(manager, request, P2pWithdrawStateEnum.CANCELLED, "cancelled by user");
      await this.audit.record(ctx, "p2p.withdraw_cancelled", "p2p_withdraw_request", request.id);
      return request;
    });
  }

  /** Shared by cancel and the expiry worker: release the lock, close the parts. */
  async closeRequest(
    manager: EntityManager,
    request: P2pWithdrawRequestEntity,
    state: P2pWithdrawStateEnum.CANCELLED | P2pWithdrawStateEnum.EXPIRED,
    reason: string,
  ): Promise<void> {
    await this.settlement.releaseLock(manager, request, Number(request.lockedAmount), reason);

    const openParts = await manager.find(P2pWithdrawPartEntity, {
      where: { withdrawRequestId: request.id, status: P2pPartStatusEnum.OPEN },
    });
    for (const part of openParts) {
      const target =
        state === P2pWithdrawStateEnum.CANCELLED
          ? P2pPartStatusEnum.CANCELLED
          : P2pPartStatusEnum.EXPIRED;
      assertPartTransition(part.status, target);
      part.status = target;
      await manager.save(part);
    }

    assertWithdrawTransition(request.state, state);
    request.state = state;
    await manager.save(request);

    await manager.update(WithdrawEntity, { id: request.withdrawId }, {
      status:
        state === P2pWithdrawStateEnum.CANCELLED
          ? WithdrawStatusEnum.CANCELLED
          : WithdrawStatusEnum.FAILED,
      completedAt: new Date(),
    });
  }

  // ─── Internals ─────────────────────────────────────────────

  private async loadAwaitingMatch(manager: EntityManager, userId: string, partId: string) {
    const part = await manager.findOne(P2pWithdrawPartEntity, {
      where: { id: partId },
      lock: { mode: "pessimistic_write" },
    });
    if (!part) throw new NotFoundException("Withdrawal part not found");

    const request = await manager.findOne(P2pWithdrawRequestEntity, {
      where: { id: part.withdrawRequestId },
    });
    if (!request) throw new NotFoundException("Withdrawal request not found");
    if (request.userId !== userId) throw new ForbiddenException("Access denied");

    const match = await manager.findOne(P2pMatchEntity, {
      where: { withdrawPartId: part.id, status: P2pMatchStatusEnum.WAITING_CONFIRMATION },
    });
    if (!match) throw new BadRequestException("This part has no payment awaiting your response");

    const intent = await manager.findOne(P2pDepositIntentEntity, {
      where: { id: match.depositIntentId },
    });
    if (!intent) throw new NotFoundException("Deposit intent not found");

    return { part, request, match, intent };
  }

  private resolvePartCount(
    split: CreateP2pWithdrawDto["split"],
    total: number,
    dto: CreateP2pWithdrawDto,
  ): number {
    const count =
      split.policy === P2pSplitPolicyEnum.EXACT
        ? Number(split.parts)
        : split.policy === P2pSplitPolicyEnum.MAXIMUM
          ? Number(split.maxParts)
          : Number(split.minParts);

    if (!count || count < 1) {
      throw new BadRequestException("Split policy requires a valid part count");
    }
    if (split.policy === P2pSplitPolicyEnum.RANGE) {
      if (!split.maxParts || Number(split.maxParts) < count) {
        throw new BadRequestException("maxParts must be greater than or equal to minParts");
      }
    }

    const minPart = Number(dto.constraints?.minPart ?? 0);
    const maxPart = Number(dto.constraints?.maxPart ?? 0);
    const perPart = total / count;
    if (minPart > 0 && perPart < minPart) {
      throw new BadRequestException(
        "تعداد مراحل با حداقل مبلغ هر مرحله سازگار نیست",
      );
    }
    if (maxPart > 0 && perPart > maxPart) {
      throw new BadRequestException(
        "تعداد مراحل با حداکثر مبلغ هر مرحله سازگار نیست",
      );
    }
    return count;
  }

  /** Even split, with any rounding remainder pushed onto the last part. */
  private splitAmounts(total: number, count: number): number[] {
    const base = round8(total / count);
    const amounts = Array.from({ length: count }, () => base);
    const drift = round8(total - base * count);
    amounts[count - 1] = round8(amounts[count - 1] + drift);
    return amounts;
  }
}
