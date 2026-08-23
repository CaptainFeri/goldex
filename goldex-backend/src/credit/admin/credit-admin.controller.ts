import { Controller, Post, Get, Body, Param, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { CreateCreditDto } from "../dto/create-credit.dto";
import { SettleCreditDto } from "../dto/settle-credit.dto";
import { CancelCreditDto } from "../dto/cancel-credit.dto";
import { CreditQueryDto } from "../dto/credit-query.dto";
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

  @Post(":id/settle")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Settle a credit with optional description and image" })
  async settle(@Req() req: any, @Param("id") id: string, @Body() dto: SettleCreditDto) {
    return { data: await this.creditService.settleCredit(req.admin.id, id, dto.description, dto.imagePath) };
  }

  @Post(":id/cancel")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Cancel a credit" })
  async cancel(@Req() req: any, @Param("id") id: string, @Body() dto: CancelCreditDto) {
    return { data: await this.creditService.cancelCredit(req.admin.id, id, dto.reason) };
  }

  @Get()
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get all credits with filters" })
  async findAll(@Query() query: CreditQueryDto) {
    return { data: await this.creditService.getAllCredits(query) };
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
