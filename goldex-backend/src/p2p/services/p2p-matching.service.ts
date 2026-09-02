import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import { P2pWithdrawRequestEntity } from "../entity/p2p-withdraw-request.entity";
import { P2pDepositIntentEntity } from "../entity/p2p-deposit-intent.entity";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import {
  P2pEscalationReasonEnum,
  P2pIntentStateEnum,
  P2pMatchSourceEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pSourcePriorityEnum,
  P2pWithdrawStateEnum,
} from "../enum/p2p.enums";
import { assertIntentTransition, assertPartTransition } from "../state/transitions";
import { P2pSettingService } from "./p2p-setting.service";
import { AdminBankAccountService } from "../../admin-bank-account/admin-bank-account.service";
import { BankAccountDirectionEnum } from "../../admin-bank-account/enum/admin-bank-account-status.enum";
import { AdminBankAccountEntity } from "../../admin-bank-account/entity/admin-bank-account.entity";
import { P2pEvents } from "../../shared/constants/events.constants";

const CANDIDATE_LIMIT = 50;

interface ScoredCandidate {
  part: P2pWithdrawPartEntity;
  request: P2pWithdrawRequestEntity;
  score: number;
  breakdown: Record<string, number>;
}

@Injectable()
export class P2pMatchingService {
  private readonly logger = new Logger(P2pMatchingService.name);

  constructor(
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(P2pDepositIntentEntity)
    private readonly intentRepo: Repository<P2pDepositIntentEntity>,
    private readonly dataSource: DataSource,
    private readonly settings: P2pSettingService,
    private readonly bankAccounts: AdminBankAccountService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Finds and atomically reserves the best withdrawal part for an intent.
   *
   * Selection and reservation happen in one transaction using
   * `FOR UPDATE SKIP LOCKED`, which is what makes two depositors racing the
   * same part resolve to exactly one winner without a separate lock service:
   * the loser simply does not see the row and moves to the next candidate.
   */
  async reserveForIntent(intentId: string): Promise<P2pMatchEntity | null> {
    const settings = await this.settings.get();

    const match = await this.dataSource.transaction(async (manager) => {
      const intent = await manager.findOne(P2pDepositIntentEntity, {
        where: { id: intentId },
        lock: { mode: "pessimistic_write" },
      });
      if (!intent) return null;
      if (
        ![
          P2pIntentStateEnum.CREATED,
          P2pIntentStateEnum.MATCHING,
          P2pIntentStateEnum.NO_MATCH,
        ].includes(intent.state)
      ) {
        return null;
      }

      if (intent.state !== P2pIntentStateEnum.MATCHING) {
        assertIntentTransition(intent.state, P2pIntentStateEnum.MATCHING);
        intent.state = P2pIntentStateEnum.MATCHING;
        await manager.save(intent);
      }

      const adminFirst =
        settings.sourcePriority.deposit === P2pSourcePriorityEnum.ADMIN_FIRST;

      if (adminFirst) {
        const adminMatch = await this.reserveFromAdminAccount(manager, intent, settings);
        if (adminMatch) return adminMatch;
      }

      const candidates = await this.loadCandidates(manager, intent);
      const scored = candidates
        .map((c) => this.score(c, intent, settings.matchingWeights))
        .sort((a, b) => b.score - a.score);

      if (scored.length) {
        return this.reservePart(manager, intent, scored[0], settings);
      }

      // Customer-first only falls back to a company account once the retry
      // budget is spent, so real peer liquidity is preferred.
      if (!adminFirst && intent.retryCount >= settings.matchingMaxRetry) {
        const adminMatch = await this.reserveFromAdminAccount(manager, intent, settings);
        if (adminMatch) return adminMatch;
      }

      intent.retryCount += 1;
      assertIntentTransition(intent.state, P2pIntentStateEnum.NO_MATCH);
      intent.state = P2pIntentStateEnum.NO_MATCH;
      await manager.save(intent);
      return null;
    });

    if (match) {
      this.eventEmitter.emit(P2pEvents.MATCHED, {
        matchId: match.id,
        depositIntentId: match.depositIntentId,
        amount: Number(match.amount),
      });
    } else {
      this.eventEmitter.emit(P2pEvents.NO_MATCH, { depositIntentId: intentId });
    }
    return match;
  }

  // ─── Candidate selection ───────────────────────────────────

  private async loadCandidates(
    manager: EntityManager,
    intent: P2pDepositIntentEntity,
  ): Promise<{ part: P2pWithdrawPartEntity; request: P2pWithdrawRequestEntity }[]> {
    const amount = Number(intent.requestedAmount);
    const now = new Date();

    // SKIP LOCKED is the whole concurrency story: a part another transaction
    // is reserving right now is invisible here rather than blocking.
    const rows: { part_id: string; request_id: string }[] = await manager.query(
      `SELECT p.id AS part_id, r.id AS request_id
         FROM p2p_withdraw_part p
         JOIN p2p_withdraw_request r ON r.id = p.withdraw_request_id
        WHERE p.status = $1
          AND p.deleted_at IS NULL
          AND r.deleted_at IS NULL
          AND r.state = ANY($2)
          AND r.symbol_id = $3
          AND r.user_id <> $4
          AND p.target_amount = $5
          AND (r.min_part_amount IS NULL OR $5 >= r.min_part_amount)
          AND (r.max_part_amount IS NULL OR $5 <= r.max_part_amount)
          AND (r.allowed_from IS NULL OR r.allowed_from <= $6)
          AND (r.allowed_until IS NULL OR r.allowed_until >= $6)
          AND (r.expires_at IS NULL OR r.expires_at > $6)
        ORDER BY r.created_at ASC
        LIMIT $7
        FOR UPDATE OF p SKIP LOCKED`,
      [
        P2pPartStatusEnum.OPEN,
        [P2pWithdrawStateEnum.PENDING_MATCHING, P2pWithdrawStateEnum.PARTIALLY_MATCHED],
        intent.symbolId,
        intent.userId,
        amount,
        now,
        CANDIDATE_LIMIT,
      ],
    );

    const out: { part: P2pWithdrawPartEntity; request: P2pWithdrawRequestEntity }[] = [];
    for (const row of rows) {
      const part = await manager.findOne(P2pWithdrawPartEntity, { where: { id: row.part_id } });
      const request = await manager.findOne(P2pWithdrawRequestEntity, {
        where: { id: row.request_id },
      });
      if (part && request) out.push({ part, request });
    }
    return out;
  }

  /**
   * Score from spec §6.3. Every component is persisted on the match so an
   * admin can review why this part won.
   */
  private score(
    candidate: { part: P2pWithdrawPartEntity; request: P2pWithdrawRequestEntity },
    intent: P2pDepositIntentEntity,
    weights: { amountFit: number; partsFit: number; constraints: number; age: number; priority: number; risk: number },
  ): ScoredCandidate {
    const { part, request } = candidate;
    const deposit = Number(intent.requestedAmount);
    const target = Number(part.targetAmount);

    const amountFit = 1 - Math.abs(target - deposit) / Math.max(target, deposit, 1);

    // A request closer to finishing is worth completing first.
    const total = Number(request.totalAmount) || 1;
    const partsFit = Number(request.completedAmount) / total;

    const wanted = intent.constraintsJson ?? {};
    const checks: boolean[] = [];
    if (wanted.preferredBank) {
      checks.push(request.preferredBank === wanted.preferredBank);
    }
    if (wanted.minPart) checks.push(target >= Number(wanted.minPart));
    if (wanted.maxPart) checks.push(target <= Number(wanted.maxPart));
    const constraintFit = checks.length ? checks.filter(Boolean).length / checks.length : 1;

    // Aging, bounded at 24h so an old request cannot dominate forever.
    const ageHours = (Date.now() - new Date(request.createAt).getTime()) / 3_600_000;
    const ageFit = Math.min(1, ageHours / 24);

    const breakdown = {
      amountFit: Number((weights.amountFit * amountFit).toFixed(4)),
      partsFit: Number((weights.partsFit * partsFit).toFixed(4)),
      constraints: Number((weights.constraints * constraintFit).toFixed(4)),
      age: Number((weights.age * ageFit).toFixed(4)),
      priority: weights.priority,
      // No counterparty risk model yet — the weight exists so one can be added
      // without a schema change.
      risk: 0,
    };
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { part, request, score: Number(score.toFixed(4)), breakdown };
  }

  private async reservePart(
    manager: EntityManager,
    intent: P2pDepositIntentEntity,
    chosen: ScoredCandidate,
    settings: Awaited<ReturnType<P2pSettingService["get"]>>,
  ): Promise<P2pMatchEntity> {
    const { part, request } = chosen;
    const reservationId = crypto.randomUUID();
    const now = Date.now();

    assertPartTransition(part.status, P2pPartStatusEnum.RESERVED);
    part.status = P2pPartStatusEnum.RESERVED;
    part.activeReservationId = reservationId;
    part.reservedUntil = new Date(now + settings.reservationTtlMinutes * 60_000);
    await manager.save(part);

    const match = await manager.save(
      manager.create(P2pMatchEntity, {
        id: reservationId,
        depositIntentId: intent.id,
        withdrawPartId: part.id,
        amount: Number(part.targetAmount),
        score: chosen.score,
        scoreBreakdownJson: chosen.breakdown,
        source: P2pMatchSourceEnum.CUSTOMER,
        // Frozen here so editing the withdrawer's bank account later cannot
        // rewrite what this depositor was told to pay.
        destinationSnapshotJson: request.destinationSnapshotJson,
        status: P2pMatchStatusEnum.RESERVED,
        reservedAt: new Date(now),
        reservationExpiresAt: new Date(now + settings.reservationTtlMinutes * 60_000),
        settlementDeadlineAt: new Date(now + settings.settlementTimeoutMinutes * 60_000),
      }),
    );

    assertIntentTransition(intent.state, P2pIntentStateEnum.RESERVED);
    intent.state = P2pIntentStateEnum.RESERVED;
    await manager.save(intent);

    this.logger.log(
      `p2p intent ${intent.id} reserved part ${part.id} (score ${chosen.score})`,
    );
    return match;
  }

  /**
   * Fills the deposit from a company account flagged for deposit. Returns null
   * when none is eligible — the caller then queues or escalates rather than
   * silently doing nothing.
   */
  private async reserveFromAdminAccount(
    manager: EntityManager,
    intent: P2pDepositIntentEntity,
    settings: Awaited<ReturnType<P2pSettingService["get"]>>,
  ): Promise<P2pMatchEntity | null> {
    const amount = Number(intent.requestedAmount);
    const account = await this.bankAccounts.pickAccount(
      BankAccountDirectionEnum.DEPOSIT,
      intent.symbolId,
      amount,
      manager,
    );
    if (!account) return null;

    const now = Date.now();
    const match = await manager.save(
      manager.create(P2pMatchEntity, {
        depositIntentId: intent.id,
        withdrawPartId: null,
        amount,
        source: P2pMatchSourceEnum.ADMIN,
        adminAccountId: account.id,
        destinationSnapshotJson: this.snapshotAccount(account),
        status: P2pMatchStatusEnum.RESERVED,
        reservedAt: new Date(now),
        reservationExpiresAt: new Date(now + settings.reservationTtlMinutes * 60_000),
        settlementDeadlineAt: new Date(now + settings.settlementTimeoutMinutes * 60_000),
      }),
    );

    assertIntentTransition(intent.state, P2pIntentStateEnum.RESERVED);
    intent.state = P2pIntentStateEnum.RESERVED;
    await manager.save(intent);

    this.logger.log(`p2p intent ${intent.id} filled from company account ${account.id}`);
    return match;
  }

  private snapshotAccount(account: AdminBankAccountEntity): Record<string, any> {
    return {
      bankName: account.bankName,
      ownerName: account.ownerName,
      iban: account.iban,
      cardNumber: account.cardNumber,
      accountNumber: account.accountNumber,
      adminAccountId: account.id,
    };
  }

  /** Reason to raise when a payout has no eligible company account. */
  static readonly NO_ADMIN_ACCOUNT = P2pEscalationReasonEnum.ADMIN_ACCOUNT_UNAVAILABLE;
}
