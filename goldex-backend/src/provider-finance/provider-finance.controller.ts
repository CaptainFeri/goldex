import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProviderFinanceService } from "./provider-finance.service";
import { SettleDto } from "./dto/settle.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Provider-Finance")
@ApiBearerAuth()
@Controller("admin/provider-finance")
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
export class ProviderFinanceController {
  constructor(private readonly service: ProviderFinanceService) {}

  // Per-provider per-symbol bedehkar/bestankar (outstanding after settlements).
  // NOTE: served at /overview (not the bare path) because admin-management's
  // greedy @Controller("admin") @Get(":id") shadows 2-segment /admin/* routes.
  @Get("overview")
  @ApiOperation({ summary: "Provider finance overview (debit/credit per symbol)" })
  async overview() {
    return { data: await this.service.getOverview() };
  }

  // Record a physical settlement (receive asset from / pay asset to provider).
  @Post("settle")
  @ApiOperation({ summary: "Record a settlement with a provider" })
  async settle(@Body() dto: SettleDto, @Req() req: AdminExpressRequest) {
    return { data: await this.service.settle(dto, req.admin?.id) };
  }

  @Get("settlements")
  @ApiOperation({ summary: "Settlement history" })
  async settlements(@Query("provider") provider?: string) {
    return { data: await this.service.getSettlements(provider) };
  }
}
