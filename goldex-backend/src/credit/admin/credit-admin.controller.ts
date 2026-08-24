import { Controller, Post, Get, Body, Param, Query, Req, UseGuards, Res, Header } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { CreateCreditDto } from "../dto/create-credit.dto";
import { SettleCreditDto } from "../dto/settle-credit.dto";
import { CancelCreditDto } from "../dto/cancel-credit.dto";
import { CreditQueryDto } from "../dto/credit-query.dto";
import { ExtendCreditDto, AdjustCreditLimitDto } from "../dto/extend-credit.dto";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../../admin/role/admin.role.decorator";
import { AdminRole } from "../../admin/role/admin.roles.enum";
import { AdminWorkTimeGuard } from "../../admin-schedule/admin-work-time.guard";

@ApiTags("Admin-Credit-Management")
@Controller("admin/credits")
@UseGuards(AdminAuthGuard, AdminWorkTimeGuard)
@ApiBearerAuth()
export class CreditAdminController {
  constructor(private readonly creditService: CreditService) {}

  @Post()
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Create a new credit for a user" })
  @ApiResponse({ status: 201, description: "Credit created successfully" })
  async create(@Req() req: any, @Body() dto: CreateCreditDto) {
    return { data: await this.creditService.createCredit(req.admin.id, dto) };
  }

  @Get("stats")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Aggregate credit KPIs for the dashboard" })
  async stats() {
    return { data: await this.creditService.getCreditStats() };
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
    return { data: await this.creditService.settleCredit(req.admin.id, id, dto.description, dto.imagePath) };
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
}
