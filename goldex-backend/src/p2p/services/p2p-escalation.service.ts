import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pEscalationEntity } from "../entity/p2p-escalation.entity";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import { P2pDepositIntentEntity } from "../entity/p2p-deposit-intent.entity";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import {
  P2pEscalationReasonEnum,
  P2pEscalationStatusEnum,
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pResolutionTypeEnum,
} from "../enum/p2p.enums";
import {
  assertEscalationTransition,
  assertIntentTransition,
  assertMatchTransition,
  assertPartTransition,
} from "../state/transitions";
import { P2pSettlementService } from "./p2p-settlement.service";
import { P2pSettingService } from "./p2p-setting.service";
import { P2pAuditService, AuditContext } from "./p2p-audit.service";
import { ResolveEscalationDto } from "../dto/resolve-escalation.dto";
import { EscalationQueryDto } from "../dto/escalation-query.dto";
import { DepositEntity } from "../../deposit/deposit.entity";
import { DepositStatusEnum } from "../../deposit/enum/deposit-status.enum";
import { P2pEvents } from "../../shared/constants/events.constants";

@Injectable()
export class P2pEscalationService {
  private readonly logger = new Logger(P2pEscalationService.name);

  constructor(
    @InjectRepository(P2pEscalationEntity)
    private readonly repo: Repository<P2pEscalationEntity>,
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    private readonly dataSource: DataSource,
    private readonly settlement: P2pSettlementService,
    private readonly settings: P2pSettingService,
    private readonly audit: P2pAuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Opens an escalation for a match, moving it to ESCALATED. Idempotent: a
   * match that already has an open case is not escalated twice, which matters
   * because reject and response-timeout can race.
   */
  async open(
    matchId: string,
    reason: P2pEscalationReasonEnum,
    opts: { priority?: number; note?: string } = {},
  ): Promise<P2pEscalationEntity> {
    const existing = await this.repo.findOne({
      where: [
        { matchId, status: P2pEscalationStatusEnum.OPEN },
        { matchId, status: P2pEscalationStatusEnum.ASSIGNED },
      ],
    });
    if (existing) return existing;

    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException("Match not found");

    const settings = await this.settings.get();

    return this.dataSource.transaction(async (manager) => {
      if (match.status !== P2pMatchStatusEnum.ESCALATED) {
        assertMatchTransition(match.status, P2pMatchStatusEnum.ESCALATED);
        match.status = P2pMatchStatusEnum.ESCALATED;
        await manager.save(match);
      }

      const intent = await manager.findOne(P2pDepositIntentEntity, {
        where: { id: match.depositIntentId },
      });
      if (intent && intent.state !== P2pIntentStateEnum.ESCALATED_TO_ADMIN) {
        assertIntentTransition(intent.state, P2pIntentStateEnum.ESCALATED_TO_ADMIN);
        intent.state = P2pIntentStateEnum.ESCALATED_TO_ADMIN;
        await manager.save(intent);
        await manager.update(DepositEntity, { id: intent.depositId }, {
          status: DepositStatusEnum.PROCESSING,
        });
      }

      const escalation = await manager.save(
        manager.create(P2pEscalationEntity, {
          matchId,
          reason,
          priority: opts.priority ?? 5,
          status: P2pEscalationStatusEnum.OPEN,
          deadlineAt: new Date(Date.now() + settings.settlementTimeoutMinutes * 60_000),
          resolutionNote: opts.note ?? null,
        }),
      );

      await this.audit.record(
        P2pAuditService.system(),
        "p2p.escalation_opened",
        "p2p_escalation",
        escalation.id,
        null,
        { matchId, reason },
        manager,
      );

      this.eventEmitter.emit(P2pEvents.ESCALATED, {
        escalationId: escalation.id,
        matchId,
        reason,
        amount: Number(match.amount),
      });

      this.logger.warn(`p2p escalation ${escalation.id} opened for match ${matchId} (${reason})`);
      return escalation;
    });
  }

  async findAll(query: EscalationQueryDto) {
    const { status, reason, assignedAdminId, minAmount, page = 1, limit = 20 } = query;
    const qb = this.repo
      .createQueryBuilder("e")
      .leftJoinAndSelect("e.match", "match")
      .leftJoinAndSelect("match.paymentProof", "proof")
      .leftJoinAndSelect("match.depositIntent", "intent")
      .leftJoinAndSelect("intent.user", "depositor")
      .orderBy("e.priority", "ASC")
      .addOrderBy("e.created_at", "ASC")
      .skip((page - 1) * limit)
      .take(limit);

    if (status) qb.andWhere("e.status = :status", { status });
    if (reason) qb.andWhere("e.reason = :reason", { reason });
    if (assignedAdminId) qb.andWhere("e.assigned_admin_id = :assignedAdminId", { assignedAdminId });
    if (minAmount) qb.andWhere("match.amount >= :minAmount", { minAmount });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findById(id: string): Promise<P2pEscalationEntity> {
    const escalation = await this.repo.findOne({
      where: { id },
      relations: { match: { paymentProof: true, depositIntent: { user: true } } },
    });
    if (!escalation) throw new NotFoundException("Escalation not found");
    return escalation;
  }

  async assign(id: string, adminId: string): Promise<P2pEscalationEntity> {
    const escalation = await this.findById(id);
    assertEscalationTransition(escalation.status, P2pEscalationStatusEnum.ASSIGNED);
    escalation.status = P2pEscalationStatusEnum.ASSIGNED;
    escalation.assignedAdminId = adminId;
    return this.repo.save(escalation);
  }

  /**
   * Records the admin's decision and carries it out. Above the two-person
   * threshold the decision is only staged; a second admin must check it before
   * money moves.
   */
  async resolve(
    id: string,
    adminId: string,
    dto: ResolveEscalationDto,
    ctx: AuditContext,
  ): Promise<P2pEscalationEntity> {
    const escalation = await this.findById(id);
    if (escalation.status === P2pEscalationStatusEnum.RESOLVED) {
      throw new BadRequestException("This escalation is already resolved");
    }
    if (!dto.note?.trim()) {
      throw new BadRequestException("A reason is required and is written to the audit log");
    }

    const settings = await this.settings.get();
    const amount = Number(escalation.match?.amount ?? 0);
    const movesMoney =
      dto.resolution === P2pResolutionTypeEnum.CONFIRM_PAYMENT ||
      dto.resolution === P2pResolutionTypeEnum.SETTLE_FROM_ADMIN;

    // Maker step: stage the decision and wait for a different admin to check it.
    if (
      movesMoney &&
      settings.twoPersonApprovalThreshold > 0 &&
      amount >= settings.twoPersonApprovalThreshold &&
      escalation.checkerAdminId !== adminId &&
      !escalation.pendingResolutionJson
    ) {
      escalation.pendingResolutionJson = { ...dto, makerAdminId: adminId, stagedAt: new Date() };
      escalation.resolvedByAdminId = adminId;
      escalation.resolutionNote = dto.note;
      const staged = await this.repo.save(escalation);
      await this.audit.record(ctx, "p2p.escalation_staged", "p2p_escalation", id, null, dto);
      this.logger.log(`p2p escalation ${id} staged by ${adminId}, awaiting a checker`);
      return staged;
    }

    // Checker step: a staged decision may only be executed by a second admin.
    if (escalation.pendingResolutionJson) {
      const makerId = escalation.pendingResolutionJson.makerAdminId;
      if (makerId === adminId) {
        throw new BadRequestException(
          "A second admin must approve this settlement before it can execute",
        );
      }
      escalation.checkerAdminId = adminId;
      escalation.checkedAt = new Date();
    }

    const before = { status: escalation.status, resolutionType: escalation.resolutionType };

    await this.dataSource.transaction(async (manager) => {
      const match = await manager.findOne(P2pMatchEntity, {
        where: { id: escalation.matchId },
        lock: { mode: "pessimistic_write" },
      });
      if (!match) throw new NotFoundException("Match not found");

      const intent = await manager.findOne(P2pDepositIntentEntity, {
        where: { id: match.depositIntentId },
      });

      switch (dto.resolution) {
        case P2pResolutionTypeEnum.CONFIRM_PAYMENT:
          await this.settlement.settle(manager, match.id, ctx);
          break;

        case P2pResolutionTypeEnum.SETTLE_FROM_ADMIN: {
          if (!dto.adminAccountId) {
            throw new BadRequestException("adminAccountId is required for SETTLE_FROM_ADMIN");
          }
          if (!match.withdrawPartId) {
            throw new BadRequestException("This match has no withdrawal part to settle");
          }
          await this.settlement.settlePartFromAdmin(
            manager,
            match.withdrawPartId,
            dto.adminAccountId,
            ctx,
          );
          // The depositor's own payment is not accepted here — this decision
          // funds the withdrawer from the company account instead.
          await this.failIntent(manager, match, intent, P2pIntentStateEnum.REJECTED);
          break;
        }

        case P2pResolutionTypeEnum.REJECT_PAYMENT:
          await this.releasePart(manager, match, P2pPartStatusEnum.OPEN);
          await this.failIntent(manager, match, intent, P2pIntentStateEnum.REJECTED);
          break;

        case P2pResolutionTypeEnum.REOPEN_MATCHING:
          await this.releasePart(manager, match, P2pPartStatusEnum.OPEN);
          if (intent) {
            assertIntentTransition(intent.state, P2pIntentStateEnum.MATCHING);
            intent.state = P2pIntentStateEnum.MATCHING;
            await manager.save(intent);
          }
          assertMatchTransition(match.status, P2pMatchStatusEnum.CANCELLED);
          match.status = P2pMatchStatusEnum.CANCELLED;
          await manager.save(match);
          break;

        case P2pResolutionTypeEnum.REQUEST_MORE_EVIDENCE:
          if (intent) {
            assertIntentTransition(intent.state, P2pIntentStateEnum.MORE_INFO_REQUESTED);
            intent.state = P2pIntentStateEnum.MORE_INFO_REQUESTED;
            await manager.save(intent);
          }
          break;

        case P2pResolutionTypeEnum.CANCEL_REQUEST:
          await this.releasePart(manager, match, P2pPartStatusEnum.CANCELLED);
          await this.failIntent(manager, match, intent, P2pIntentStateEnum.CANCELLED);
          break;

        default:
          throw new BadRequestException(`Unsupported resolution: ${dto.resolution}`);
      }
    });

    // REQUEST_MORE_EVIDENCE leaves the case open — the admin is waiting on the
    // depositor, not finished with it.
    const closes = dto.resolution !== P2pResolutionTypeEnum.REQUEST_MORE_EVIDENCE;
    if (closes) {
      assertEscalationTransition(escalation.status, P2pEscalationStatusEnum.RESOLVED);
      escalation.status = P2pEscalationStatusEnum.RESOLVED;
      escalation.resolvedAt = new Date();
    }
    escalation.resolutionType = dto.resolution;
    escalation.resolutionNote = dto.note;
    escalation.resolvedByAdminId = escalation.resolvedByAdminId ?? adminId;
    escalation.pendingResolutionJson = null;
    const saved = await this.repo.save(escalation);

    await this.audit.record(ctx, "p2p.escalation_resolved", "p2p_escalation", id, before, {
      resolution: dto.resolution,
      note: dto.note,
      adminAccountId: dto.adminAccountId,
    });

    this.eventEmitter.emit(P2pEvents.ESCALATION_RESOLVED, {
      escalationId: id,
      matchId: escalation.matchId,
      resolution: dto.resolution,
    });

    return saved;
  }

  // ─── Internals ─────────────────────────────────────────────

  private async releasePart(
    manager: any,
    match: P2pMatchEntity,
    target: P2pPartStatusEnum,
  ): Promise<void> {
    if (!match.withdrawPartId) return;
    const part = await manager.findOne(P2pWithdrawPartEntity, {
      where: { id: match.withdrawPartId },
      lock: { mode: "pessimistic_write" },
    });
    if (!part || part.status === P2pPartStatusEnum.CONFIRMED) return;

    assertPartTransition(part.status, target);
    part.status = target;
    part.activeReservationId = null;
    part.reservedUntil = null;
    await manager.save(part);
  }

  private async failIntent(
    manager: any,
    match: P2pMatchEntity,
    intent: P2pDepositIntentEntity | null,
    state: P2pIntentStateEnum,
  ): Promise<void> {
    if (!intent) return;
    assertIntentTransition(intent.state, state);
    intent.state = state;
    await manager.save(intent);

    await manager.update(DepositEntity, { id: intent.depositId }, {
      status:
        state === P2pIntentStateEnum.CANCELLED
          ? DepositStatusEnum.CANCELLED
          : DepositStatusEnum.FAILED,
      completedAt: new Date(),
    });

    if (match.status !== P2pMatchStatusEnum.CANCELLED) {
      assertMatchTransition(match.status, P2pMatchStatusEnum.CANCELLED);
      match.status = P2pMatchStatusEnum.CANCELLED;
      await manager.save(match);
    }
  }
}
