import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { P2pEscalationService } from "./services/p2p-escalation.service";
import { P2pSettingService } from "./services/p2p-setting.service";
import { P2pLiquidityService } from "./services/p2p-liquidity.service";
import { P2pMatchEntity } from "./entity/p2p-match.entity";
import { P2pWithdrawRequestEntity } from "./entity/p2p-withdraw-request.entity";
import { P2pDepositIntentEntity } from "./entity/p2p-deposit-intent.entity";
import { P2pAuditLogEntity } from "./entity/p2p-audit-log.entity";
import { EscalationQueryDto } from "./dto/escalation-query.dto";
import { ResolveEscalationDto } from "./dto/resolve-escalation.dto";
import { UpdateP2pSettingsDto } from "./dto/update-p2p-settings.dto";
import {
  P2pAuditActorEnum,
  P2pEscalationStatusEnum,
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pWithdrawStateEnum,
} from "./enum/p2p.enums";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AuditContext } from "./services/p2p-audit.service";

@ApiTags("Admin-P2P")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/p2p")
export class P2pAdminController {
  constructor(
    private readonly escalations: P2pEscalationService,
    private readonly settings: P2pSettingService,
    private readonly liquidity: P2pLiquidityService,
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly requestRepo: Repository<P2pWithdrawRequestEntity>,
    @InjectRepository(P2pDepositIntentEntity)
    private readonly intentRepo: Repository<P2pDepositIntentEntity>,
    @InjectRepository(P2pAuditLogEntity)
    private readonly auditRepo: Repository<P2pAuditLogEntity>,
  ) {}

  private ctx(req: AdminExpressRequest): AuditContext {
    return {
      actorType: P2pAuditActorEnum.ADMIN,
      actorId: (req as any).admin?.id,
      ip: (req as any).ip,
      userAgent: (req as any).headers?.["user-agent"],
    };
  }

  @Get("dashboard")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Operational counters for the p2p queue" })
  async dashboard() {
    const soon = new Date(Date.now() + 30 * 60_000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      pendingWithdrawals,
      unmatchedDeposits,
      waitingConfirmation,
      escalated,
      timeoutRisk,
      liquidity,
    ] = await Promise.all([
        this.requestRepo.count({
          where: [
            { state: P2pWithdrawStateEnum.PENDING_MATCHING },
            { state: P2pWithdrawStateEnum.PARTIALLY_MATCHED },
          ],
        }),
        this.intentRepo.count({ where: { state: P2pIntentStateEnum.NO_MATCH } }),
        this.matchRepo.count({ where: { status: P2pMatchStatusEnum.WAITING_CONFIRMATION } }),
        this.escalations
          .findAll({ status: P2pEscalationStatusEnum.OPEN, limit: 1 })
          .then((r) => r.total),
        this.matchRepo
          .createQueryBuilder("m")
          .where("m.status = :status", { status: P2pMatchStatusEnum.WAITING_CONFIRMATION })
          .andWhere("m.response_deadline_at < :soon", { soon })
          .getCount(),
        this.liquidity.getLiquidity(),
      ]);

    const today = await this.matchRepo
      .createQueryBuilder("m")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(m.amount), 0)", "amount")
      .where("m.status = :status", { status: P2pMatchStatusEnum.CONFIRMED })
      .andWhere("m.settled_at >= :start", { start: startOfDay })
      .getRawOne();

    return {
      data: {
        pendingWithdrawals,
        unmatchedDeposits,
        waitingConfirmation,
        escalated,
        timeoutRisk,
        adminLiquidity: liquidity.total,
        adminLiquidityBySymbol: liquidity.bySymbol,
        todayCompletedCount: Number(today?.count ?? 0),
        todayCompletedAmount: Number(today?.amount ?? 0),
      },
    };
  }

  @Get("escalations")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "The escalation queue" })
  async listEscalations(@Query() query: EscalationQueryDto) {
    return { data: await this.escalations.findAll(query) };
  }

  @Get("escalations/:id")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "One escalation with its proof and match" })
  async getEscalation(@Param("id") id: string) {
    return { data: await this.escalations.findById(id) };
  }

  @Post("escalations/:id/assign")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Take ownership of an escalation" })
  async assign(@Req() req: AdminExpressRequest, @Param("id") id: string) {
    return { data: await this.escalations.assign(id, (req as any).admin?.id) };
  }

  @Post("escalations/:id/resolve")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Record a decision; high-value ones need a second admin" })
  async resolve(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Body() dto: ResolveEscalationDto,
  ) {
    return {
      data: await this.escalations.resolve(id, (req as any).admin?.id, dto, this.ctx(req)),
    };
  }

  @Get("matches")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Browse matches" })
  async listMatches(
    @Query("status") status?: P2pMatchStatusEnum,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ) {
    const [items, total] = await this.matchRepo.findAndCount({
      where: status ? { status } : {},
      relations: { paymentProof: true, depositIntent: true },
      order: { createAt: "DESC" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    return { data: { items, total, page: Number(page), limit: Number(limit) } };
  }

  @Get("settings")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Runtime p2p policy" })
  async getSettings() {
    return { data: await this.settings.get() };
  }

  @Patch("settings")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update runtime p2p policy" })
  async updateSettings(@Req() req: AdminExpressRequest, @Body() dto: UpdateP2pSettingsDto) {
    return { data: await this.settings.update(dto as any, (req as any).admin?.id) };
  }

  @Get("audit-logs")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Immutable p2p audit trail" })
  async auditLogs(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 50,
  ) {
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [items, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });
    return { data: { items, total, page: Number(page), limit: Number(limit) } };
  }
}
