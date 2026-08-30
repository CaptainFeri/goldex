import { Controller, Post, Get, Body, Param, Query, Req, UseGuards, Res, Header } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { CreateCreditDto } from "../dto/create-credit.dto";
import { SettleCreditDto } from "../dto/settle-credit.dto";
import { CancelCreditDto } from "../dto/cancel-credit.dto";
import { CreditQueryDto } from "../dto/credit-query.dto";
import { ExtendCreditDto, AdjustCreditLimitDto } from "../dto/extend-credit.dto";
import { RequestSettlementDto, ReceiveSettlementAssetDto, FailSettlementDto, ApproveSettlementDto, RejectSettlementDto, SettlementPolicyDto, SelectSettlementMethodDto, FundSettlementDto } from "../dto/settlement-workflow.dto";
import { CreditSettlementWorkflowService } from "../settlement-workflow/credit-settlement-workflow.service";
import { CreditCashoutService } from "../cashout/credit-cashout.service";
import { CashoutCreditDto } from "../dto/cashout-credit.dto";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../../admin/role/admin.role.decorator";
import { AdminRole } from "../../admin/role/admin.roles.enum";
import { AdminWorkTimeGuard } from "../../admin-schedule/admin-work-time.guard";

@ApiTags("Admin-Credit-Management")
@Controller("admin/credits")
@UseGuards(AdminAuthGuard, AdminWorkTimeGuard)
@ApiBearerAuth()
export class CreditAdminController {
  constructor(
    private readonly creditService: CreditService,
    private readonly settlementWorkflowService: CreditSettlementWorkflowService,
    private readonly cashoutService: CreditCashoutService,
  ) {}

  @Post()
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Create a new credit for a user" })
  @ApiResponse({ status: 201, description: "Credit created successfully" })
  async create(@Req() req: any, @Body() dto: CreateCreditDto) {
    return { data: await this.creditService.createCredit(req.admin.id, dto) };
  }

  @Get("stats")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Aggregate credit KPIs for the dashboard (including cash-out volume and platform profit)" })
  async stats() {
    const [stats, cashout] = await Promise.all([
      this.creditService.getCreditStats(),
      this.cashoutService.getStats(),
    ]);
    return { data: { ...stats, cashout } };
  }

  @Get("export")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Export credits as CSV" })
  @Header("Content-Type", "text/csv")
  async exportCsv(@Query() query: CreditQueryDto, @Res() res: any) {
    const csv = await this.creditService.exportCreditsCsv(query);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="credits-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  }

  @Get("user/:userId")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get all credits for a user + active overview" })
  async findByUser(@Param("userId") userId: string) {
    return { data: await this.creditService.getUserCreditsAdmin(userId) };
  }

  @Get()
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get all credits with filters (paginated)" })
  async findAll(@Query() query: CreditQueryDto) {
    return { data: await this.creditService.getAllCredits(query) };
  }

  @Post(":id/settle")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Settle a credit with optional description and image" })
  async settle(@Req() req: any, @Param("id") id: string, @Body() dto: SettleCreditDto) {
    return {
      data: await this.creditService.settleCredit(req.admin.id, id, dto.description, dto.imagePath, dto.force),
    };
  }

  @Get(":id/settlement-eligibility")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Preview whether the facility can settle right now (credit wallets net to zero or positive)" })
  async settlementEligibility(@Param("id") id: string) {
    return { data: await this.creditService.getSettlementEligibility(id) };
  }

  @Post(":id/liquidate")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Force-liquidate a credit (cash-settle at mark price, consume collateral for deficit)" })
  async liquidate(@Req() req: any, @Param("id") id: string, @Body() dto: SettleCreditDto) {
    return { data: await this.creditService.forceLiquidateCredit(req.admin.id, id, dto.description) };
  }

  @Post(":id/cancel")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Cancel a credit" })
  async cancel(@Req() req: any, @Param("id") id: string, @Body() dto: CancelCreditDto) {
    return { data: await this.creditService.cancelCredit(req.admin.id, id, dto.reason) };
  }

  @Post(":id/suspend")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Suspend a credit (freeze user's wallets)" })
  async suspend(@Req() req: any, @Param("id") id: string, @Body() dto: CancelCreditDto) {
    return { data: await this.creditService.suspendCredit(req.admin.id, id, dto.reason) };
  }

  @Post(":id/reactivate")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Reactivate a suspended credit (unfreeze user's wallets)" })
  async reactivate(@Req() req: any, @Param("id") id: string, @Body() dto: CancelCreditDto) {
    return { data: await this.creditService.reactivateCredit(req.admin.id, id, dto.reason) };
  }

  @Post(":id/extend")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Extend the settlement deadline" })
  async extend(@Req() req: any, @Param("id") id: string, @Body() dto: ExtendCreditDto) {
    return { data: await this.creditService.extendCredit(req.admin.id, id, dto.hours, dto.reason) };
  }

  @Post(":id/adjust-limit")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Adjust a credit's limit (override)" })
  async adjustLimit(@Req() req: any, @Param("id") id: string, @Body() dto: AdjustCreditLimitDto) {
    return { data: await this.creditService.adjustCreditLimit(req.admin.id, id, dto.newLimit, dto.reason) };
  }

  @Get(":id/risk")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get enhanced risk view for a credit" })
  async risk(@Param("id") id: string) {
    return { data: await this.creditService.getCreditRisk(id) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get credit details with orders" })
  async findOne(@Param("id") id: string) {
    return { data: await this.creditService.getCreditById(id) };
  }

  @Get(":id/pnl")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get credit profit/loss calculation" })
  async getPnL(@Param("id") id: string) {
    const credit = await this.creditService.getCreditById(id);
    return { data: this.creditService.calculateCreditPnL(credit) };
  }

  // ── Delivery-based settlement workflow (handoff §7) ────────────────────

  @Get(":id/locks")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "List per-trade collateral locks of a credit (handoff §13)" })
  async listCollateralLocks(@Param("id") id: string) {
    return {
      data: {
        summary: await this.creditService.getCollateralLockSummary(id),
        locks: await this.creditService.getCollateralLocks(id),
      },
    };
  }

  @Get(":id/cashouts")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Cash-outs of a credit facility with their platform-profit totals" })
  async listCashouts(@Param("id") id: string) {
    return { data: await this.cashoutService.findByCredit(id) };
  }

  @Get(":id/cashout-options")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Credit purchases of a facility that can still be cashed out" })
  async cashoutOptions(@Param("id") id: string) {
    return { data: await this.cashoutService.getCashoutOptions(id) };
  }

  @Post(":id/cashout")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Cash out a credit purchase on the user's behalf (facility stays open)" })
  async cashout(@Req() req: any, @Param("id") id: string, @Body() dto: CashoutCreditDto) {
    return {
      data: await this.cashoutService.cashout(
        id,
        { creditOrderId: dto.creditOrderId, source: dto.source, notes: dto.notes },
        { adminId: req.admin?.id },
      ),
    };
  }

  @Get(":id/settlements")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "List delivery-based settlement workflows of a credit" })
  async listSettlements(@Param("id") id: string) {
    return { data: await this.settlementWorkflowService.findByCredit(id) };
  }

  @Post(":id/settlement-workflow")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Start a delivery-based settlement workflow for a credit/trade" })
  async requestSettlement(@Req() req: any, @Param("id") id: string, @Body() dto: RequestSettlementDto) {
    return {
      data: await this.settlementWorkflowService.requestSettlement(id, {
        creditOrderId: dto.creditOrderId,
        requestedBy: req.admin?.id,
        adminId: req.admin?.id,
        notes: dto.notes,
      }),
    };
  }

  @Post(":id/settlement-policy")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Set the credit settlement policy (admin approval, methods, netting) — handoff §6.3/§6.5" })
  async updateSettlementPolicy(@Req() req: any, @Param("id") id: string, @Body() dto: SettlementPolicyDto) {
    return {
      data: await this.creditService.updateSettlementPolicy(req.admin.id, id, dto),
    };
  }

  @Get("settlements/pending-review")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Admin-wide approval queue: every settlement awaiting admin review, across all credits" })
  async pendingReviewSettlements() {
    return { data: await this.settlementWorkflowService.findPendingReview() };
  }

  @Post("settlements/:settlementId/approve")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Approve a pending settlement (PENDING_ADMIN_REVIEW → APPROVED)" })
  async approveSettlement(@Req() req: any, @Param("settlementId") settlementId: string, @Body() dto: ApproveSettlementDto) {
    return { data: await this.settlementWorkflowService.approve(settlementId, req.admin.id, dto.reason) };
  }

  @Post("settlements/:settlementId/reject")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Reject a pending settlement (PENDING_ADMIN_REVIEW → REJECTED)" })
  async rejectSettlement(@Req() req: any, @Param("settlementId") settlementId: string, @Body() dto: RejectSettlementDto) {
    return { data: await this.settlementWorkflowService.reject(settlementId, req.admin.id, dto.reason) };
  }

  @Post("settlements/:settlementId/valuate")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Valuate the settlement (exposure vs collateral, three states, shortfall)" })
  async valuateSettlement(@Param("settlementId") settlementId: string) {
    return { data: await this.settlementWorkflowService.valuate(settlementId) };
  }

  @Post("settlements/:settlementId/select-method")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Select the settlement method (FULL/NET/TOPUP) on behalf of the user" })
  async selectMethod(@Req() req: any, @Param("settlementId") settlementId: string, @Body() dto: SelectSettlementMethodDto) {
    return { data: await this.settlementWorkflowService.selectMethod(settlementId, dto.method, req.admin?.id) };
  }

  @Post("settlements/:settlementId/fund")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Record funding toward the settlement shortfall" })
  async fundSettlement(@Req() req: any, @Param("settlementId") settlementId: string, @Body() dto: FundSettlementDto) {
    return { data: await this.settlementWorkflowService.fund(settlementId, dto.amount, { fundedBy: req.admin?.id, notes: dto.notes }) };
  }

  @Post("settlements/:settlementId/receive")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Record delivery of the required asset (partial allowed)" })
  async receiveAsset(@Param("settlementId") settlementId: string, @Body() dto: ReceiveSettlementAssetDto) {
    return { data: await this.settlementWorkflowService.receiveAsset(settlementId, dto.amount, dto.notes) };
  }

  @Post("settlements/:settlementId/verify")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Verify delivered asset sufficiency" })
  async verifyAsset(@Param("settlementId") settlementId: string) {
    return { data: await this.settlementWorkflowService.verifyAsset(settlementId) };
  }

  @Post("settlements/:settlementId/clear-liability")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Clear the negative credit liability (settlement engine; consumes/releases collateral locks)" })
  async clearLiability(
    @Req() req: any,
    @Param("settlementId") settlementId: string,
    @Body() body: { force?: boolean } = {},
  ) {
    return {
      data: await this.settlementWorkflowService.clearLiability(settlementId, {
        adminId: req.admin?.id,
        mode: "ADMIN",
        force: body?.force,
      }),
    };
  }

  @Post("settlements/:settlementId/settle-asset")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Mark credit asset transferred to cash wallet" })
  async settleAsset(@Param("settlementId") settlementId: string) {
    return { data: await this.settlementWorkflowService.settleAsset(settlementId) };
  }

  @Post("settlements/:settlementId/release-collateral")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Confirm collateral lock release for the trade" })
  async releaseCollateral(@Param("settlementId") settlementId: string) {
    return { data: await this.settlementWorkflowService.releaseCollateral(settlementId) };
  }

  @Post("settlements/:settlementId/close")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Close the settlement workflow and its trade" })
  async closeSettlement(@Param("settlementId") settlementId: string) {
    return { data: await this.settlementWorkflowService.close(settlementId) };
  }

  @Post("settlements/:settlementId/fail")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Mark a settlement workflow failed (retry later)" })
  async failSettlement(@Param("settlementId") settlementId: string, @Body() dto: FailSettlementDto) {
    return { data: await this.settlementWorkflowService.fail(settlementId, dto.reason) };
  }
}
