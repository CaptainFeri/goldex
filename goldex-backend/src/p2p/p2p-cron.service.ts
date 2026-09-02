import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, LessThan, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pMatchEntity } from "./entity/p2p-match.entity";
import { P2pDepositIntentEntity } from "./entity/p2p-deposit-intent.entity";
import { P2pWithdrawRequestEntity } from "./entity/p2p-withdraw-request.entity";
import { P2pWithdrawPartEntity } from "./entity/p2p-withdraw-part.entity";
import {
  P2pEscalationReasonEnum,
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pWithdrawStateEnum,
} from "./enum/p2p.enums";
import {
  assertIntentTransition,
  assertMatchTransition,
  assertPartTransition,
  assertWithdrawTransition,
} from "./state/transitions";
import { P2pMatchingService } from "./services/p2p-matching.service";
import { P2pEscalationService } from "./services/p2p-escalation.service";
import { P2pWithdrawService } from "./services/p2p-withdraw.service";
import { P2pSettingService } from "./services/p2p-setting.service";
import { AdminBankAccountService } from "../admin-bank-account/admin-bank-account.service";
import { RedisService } from "../redis/redis.service";
import { P2pEvents } from "../shared/constants/events.constants";

/**
 * Background workers from spec §13.
 *
 * Every job runs under a Redis lock: `@Cron` fires on each replica, and these
 * jobs move financial state, so two of them running at once would double-work.
 */
@Injectable()
export class P2pCronService {
  private readonly logger = new Logger(P2pCronService.name);

  constructor(
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(P2pDepositIntentEntity)
    private readonly intentRepo: Repository<P2pDepositIntentEntity>,
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly requestRepo: Repository<P2pWithdrawRequestEntity>,
    private readonly dataSource: DataSource,
    private readonly matching: P2pMatchingService,
    private readonly escalations: P2pEscalationService,
    private readonly withdrawService: P2pWithdrawService,
    private readonly settings: P2pSettingService,
    private readonly bankAccounts: AdminBankAccountService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async run(name: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
    const result = await this.redis.withLock(`p2p:cron:${name}`, ttlMs, async () => {
      try {
        await fn();
      } catch (err) {
        this.logger.error(`p2p worker ${name} failed: ${(err as Error).message}`);
      }
    });
    if (result === null) this.logger.debug(`p2p worker ${name} skipped — lock held elsewhere`);
  }

  /** Expired reservations put the part back into the pool. */
  @Cron(CronExpression.EVERY_MINUTE)
  async reservationExpiry() {
    await this.run("reservation-expiry", 55_000, async () => {
      const stale = await this.matchRepo.find({
        where: [
          {
            status: P2pMatchStatusEnum.RESERVED,
            reservationExpiresAt: LessThan(new Date()),
          },
          {
            status: P2pMatchStatusEnum.AWAITING_PAYMENT,
            reservationExpiresAt: LessThan(new Date()),
          },
        ],
        take: 200,
      });

      for (const match of stale) {
        let depositUserId: string | undefined;
        await this.dataSource.transaction(async (manager) => {
          const fresh = await manager.findOne(P2pMatchEntity, {
            where: { id: match.id },
            lock: { mode: "pessimistic_write" },
          });
          if (!fresh || fresh.status === P2pMatchStatusEnum.PROOF_SUBMITTED) return;

          assertMatchTransition(fresh.status, P2pMatchStatusEnum.RESERVATION_EXPIRED);
          fresh.status = P2pMatchStatusEnum.RESERVATION_EXPIRED;
          await manager.save(fresh);

          if (fresh.withdrawPartId) {
            const part = await manager.findOne(P2pWithdrawPartEntity, {
              where: { id: fresh.withdrawPartId },
              lock: { mode: "pessimistic_write" },
            });
            if (part && part.status === P2pPartStatusEnum.RESERVED) {
              assertPartTransition(part.status, P2pPartStatusEnum.OPEN);
              part.status = P2pPartStatusEnum.OPEN;
              part.activeReservationId = null;
              part.reservedUntil = null;
              await manager.save(part);
            }
          }

          const intent = await manager.findOne(P2pDepositIntentEntity, {
            where: { id: fresh.depositIntentId },
          });
          depositUserId = intent?.userId;
          if (intent && !this.isTerminalIntent(intent.state)) {
            assertIntentTransition(intent.state, P2pIntentStateEnum.MATCHING);
            intent.state = P2pIntentStateEnum.MATCHING;
            await manager.save(intent);
          }
        });

        this.eventEmitter.emit(P2pEvents.RESERVATION_EXPIRED, {
          matchId: match.id,
          depositUserId,
          amount: Number(match.amount),
        });
      }
      if (stale.length) this.logger.log(`Released ${stale.length} expired p2p reservation(s)`);
    });
  }

  /**
   * A withdrawer who does not answer in time never means "payment accepted" —
   * the case goes to an admin instead (spec §15.2).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async withdrawerResponseTimeout() {
    await this.run("response-timeout", 55_000, async () => {
      const overdue = await this.matchRepo.find({
        where: {
          status: P2pMatchStatusEnum.WAITING_CONFIRMATION,
          responseDeadlineAt: LessThan(new Date()),
        },
        take: 200,
      });

      for (const match of overdue) {
        let depositUserId: string | undefined;
        let withdrawUserId: string | undefined;
        await this.dataSource.transaction(async (manager) => {
          const fresh = await manager.findOne(P2pMatchEntity, {
            where: { id: match.id },
            lock: { mode: "pessimistic_write" },
          });
          if (!fresh || fresh.status !== P2pMatchStatusEnum.WAITING_CONFIRMATION) return;

          if (fresh.withdrawPartId) {
            const part = await manager.findOne(P2pWithdrawPartEntity, {
              where: { id: fresh.withdrawPartId },
            });
            if (part) {
              const request = await manager.findOne(P2pWithdrawRequestEntity, {
                where: { id: part.withdrawRequestId },
              });
              withdrawUserId = request?.userId;
            }
          }

          assertMatchTransition(fresh.status, P2pMatchStatusEnum.RESPONSE_TIMEOUT);
          fresh.status = P2pMatchStatusEnum.RESPONSE_TIMEOUT;
          await manager.save(fresh);

          const intent = await manager.findOne(P2pDepositIntentEntity, {
            where: { id: fresh.depositIntentId },
          });
          depositUserId = intent?.userId;
          if (intent) {
            assertIntentTransition(intent.state, P2pIntentStateEnum.WITHDRAWER_RESPONSE_TIMEOUT);
            intent.state = P2pIntentStateEnum.WITHDRAWER_RESPONSE_TIMEOUT;
            await manager.save(intent);
          }
        });

        this.eventEmitter.emit(P2pEvents.RESPONSE_TIMEOUT, {
          matchId: match.id,
          depositUserId,
          withdrawUserId,
          amount: Number(match.amount),
        });
        await this.escalations.open(
          match.id,
          P2pEscalationReasonEnum.WITHDRAWER_NO_RESPONSE,
          { priority: 2, note: "Withdrawer did not respond before the deadline" },
        );
      }
      if (overdue.length) {
        this.logger.warn(`${overdue.length} p2p match(es) escalated for no response`);
      }
    });
  }

  /** A request past its settlement window becomes an admin's problem. */
  @Cron(CronExpression.EVERY_MINUTE)
  async settlementTimeout() {
    await this.run("settlement-timeout", 55_000, async () => {
      const overdue = await this.matchRepo.find({
        where: {
          status: P2pMatchStatusEnum.PROOF_SUBMITTED,
          settlementDeadlineAt: LessThan(new Date()),
        },
        take: 200,
      });

      for (const match of overdue) {
        await this.escalations.open(match.id, P2pEscalationReasonEnum.SETTLEMENT_TIMEOUT, {
          priority: 2,
          note: "Settlement window elapsed",
        });
      }

      // Requests whose whole window has passed move to admin settlement so a
      // person decides how to finish them.
      const stuck = await this.requestRepo.find({
        where: {
          state: P2pWithdrawStateEnum.PARTIALLY_MATCHED,
          expiresAt: LessThan(new Date()),
        },
        take: 100,
      });
      for (const request of stuck) {
        assertWithdrawTransition(request.state, P2pWithdrawStateEnum.ADMIN_SETTLEMENT);
        request.state = P2pWithdrawStateEnum.ADMIN_SETTLEMENT;
        await this.requestRepo.save(request);
      }
    });
  }

  /** Retries queued intents, then falls back to a company account. */
  @Cron(CronExpression.EVERY_MINUTE)
  async matchingRetry() {
    await this.run("matching-retry", 55_000, async () => {
      const queued = await this.intentRepo.find({
        where: { state: P2pIntentStateEnum.NO_MATCH },
        order: { createAt: "ASC" },
        take: 100,
      });
      for (const intent of queued) {
        await this.matching.reserveForIntent(intent.id);
      }
    });
  }

  /** Expires stale requests and returns the still-locked balance. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async requestExpiry() {
    await this.run("request-expiry", 4 * 60_000, async () => {
      const expired = await this.requestRepo.find({
        where: {
          state: P2pWithdrawStateEnum.PENDING_MATCHING,
          expiresAt: LessThan(new Date()),
        },
        take: 100,
      });

      for (const request of expired) {
        await this.dataSource.transaction(async (manager) => {
          const fresh = await manager.findOne(P2pWithdrawRequestEntity, {
            where: { id: request.id },
            lock: { mode: "pessimistic_write" },
          });
          if (!fresh || fresh.state !== P2pWithdrawStateEnum.PENDING_MATCHING) return;
          await this.withdrawService.closeRequest(
            manager,
            fresh,
            P2pWithdrawStateEnum.EXPIRED,
            "request expired",
          );
        });
      }
      if (expired.length) this.logger.log(`Expired ${expired.length} p2p withdrawal request(s)`);
    });
  }

  /** Flags anything sitting well past its deadline for a human to look at. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async stuckCaseDetector() {
    await this.run("stuck-detector", 4 * 60_000, async () => {
      const settings = await this.settings.get();
      const cutoff = new Date(Date.now() - settings.settlementTimeoutMinutes * 2 * 60_000);

      const stuck = await this.matchRepo
        .createQueryBuilder("m")
        .where("m.status NOT IN (:...done)", {
          done: [
            P2pMatchStatusEnum.CONFIRMED,
            P2pMatchStatusEnum.CANCELLED,
            P2pMatchStatusEnum.RESERVATION_EXPIRED,
          ],
        })
        .andWhere("m.created_at < :cutoff", { cutoff })
        .getCount();

      if (stuck > 0) {
        this.logger.warn(`${stuck} p2p match(es) have been open past twice the settlement window`);
      }
    });
  }

  /** Rolls the per-direction daily counters on company accounts. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyLimitReset() {
    await this.run("daily-limit-reset", 10 * 60_000, async () => {
      const affected = await this.bankAccounts.resetDailyCounters();
      this.logger.log(`Reset daily limit counters on ${affected} company bank account(s)`);
    });
  }

  /**
   * Platform-wide rial is conserved by every settlement, so the sum of a
   * request's confirmed parts must equal its completed amount, and its locked
   * amount must never go negative. Either failing means a bug, not a race.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconciliation() {
    await this.run("reconciliation", 55 * 60_000, async () => {
      const drift: { id: string; completed_amount: string; parts_sum: string }[] =
        await this.dataSource.query(
          `SELECT r.id, r.completed_amount, COALESCE(SUM(p.confirmed_amount), 0) AS parts_sum
             FROM p2p_withdraw_request r
             LEFT JOIN p2p_withdraw_part p
               ON p.withdraw_request_id = r.id AND p.status = $1
            WHERE r.deleted_at IS NULL
            GROUP BY r.id, r.completed_amount
           HAVING r.completed_amount <> COALESCE(SUM(p.confirmed_amount), 0)
            LIMIT 50`,
          [P2pPartStatusEnum.CONFIRMED],
        );

      for (const row of drift) {
        this.logger.error(
          `p2p reconciliation mismatch on request ${row.id}: completed=${row.completed_amount} parts=${row.parts_sum}`,
        );
      }

      const negative = await this.requestRepo
        .createQueryBuilder("r")
        .where("r.locked_amount < 0")
        .getCount();
      if (negative > 0) {
        this.logger.error(`${negative} p2p withdrawal request(s) have a negative locked amount`);
      }
    });
  }

  private isTerminalIntent(state: P2pIntentStateEnum): boolean {
    return [
      P2pIntentStateEnum.CONFIRMED,
      P2pIntentStateEnum.REJECTED,
      P2pIntentStateEnum.REFUNDED,
      P2pIntentStateEnum.CANCELLED,
      P2pIntentStateEnum.EXPIRED,
    ].includes(state);
  }
}
