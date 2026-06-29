import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { FinancialService } from "./financial.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Financial")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/financial")
export class AdminFinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Get("summary")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Per-asset customer balances and accrued system profit" })
  async summary() {
    return { data: await this.financialService.getSummary() };
  }

  @Get("profit")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Commission revenue over time (per asset)" })
  @ApiQuery({ name: "from", required: false, description: "ISO date (default: 30 days ago)" })
  @ApiQuery({ name: "to", required: false, description: "ISO date (default: now)" })
  @ApiQuery({ name: "interval", required: false, enum: ["hour", "day", "week", "month"] })
  async profit(@Query("from") from: string, @Query("to") to: string, @Query("interval") interval: string) {
    return { data: await this.financialService.getProfitOverTime({ from, to, interval }) };
  }

  @Get("providers")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Latest balance per liquidity provider (gold/rial)" })
  async providers() {
    return { data: await this.financialService.getProviderBalances() };
  }

  @Get("provider-deals")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Per-provider balance computed from completed (done) deals" })
  async providerDeals() {
    return { data: await this.financialService.getProviderDeals() };
  }

  @Get("orders")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "All orders (admin-wide)" })
  async orders(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.financialService.getOrders(limit, offset) };
  }

  @Get("transactions")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "All wallet transactions (admin-wide)" })
  async transactions(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Query("type") type?: string
  ) {
    return { data: await this.financialService.getTransactions(limit, offset, type) };
  }

  @Get("ledger")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "System ledger entries (the system account)" })
  async ledger(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.financialService.getLedger(limit, offset) };
  }

  @Get("customers")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Customers with their wallet balances" })
  async customers(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.financialService.getCustomers(limit, offset) };
  }
}
