import { Body, Controller, Get, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AccountingService } from "./accounting.service";
import { AccountingSettingService } from "./accounting-setting.service";
import { UpdateAccountingSettingDto } from "./dto/update-accounting-setting.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Accounting")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@Controller("admin/accounting")
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly settings: AccountingSettingService
  ) {}

  @Get("settings")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Accounting policy: reference (pricing) symbol and valuation basis" })
  async getSettings() {
    const [settings, reference] = await Promise.all([
      this.settings.get(),
      this.settings.getReferenceSymbol(),
    ]);
    return {
      data: {
        ...settings,
        // The symbol actually in effect, which is the Rial fallback when no
        // reference has been chosen yet.
        effectiveReference: {
          symbolId: reference.id,
          name: reference.name,
          slug: reference.slug,
          isDefault: settings.referenceSymbolId !== reference.id,
        },
      },
    };
  }

  @Patch("settings")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Choose the pricing symbol the books are reported in" })
  async updateSettings(@Body() dto: UpdateAccountingSettingDto, @Req() req: any) {
    return { data: await this.settings.update(dto, req?.admin?.id) };
  }

  @Get("summary")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({
    summary: "Profit, cost and net profit per asset, valued at live prices in the reference symbol",
  })
  @ApiQuery({ name: "from", required: false, description: "ISO date (default: 30 days ago)" })
  @ApiQuery({ name: "to", required: false, description: "ISO date (default: now)" })
  async summary(@Query("from") from?: string, @Query("to") to?: string) {
    return {
      data: await this.accounting.getProfitSummary({
        from: parseDate(from),
        to: parseDate(to),
      }),
    };
  }

  @Get("holdings")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Customer and system balances valued in the reference symbol" })
  async holdings() {
    return { data: await this.accounting.getHoldings() };
  }

  @Get("rates")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Live conversion rate from each symbol into the reference" })
  async rates() {
    return { data: await this.accounting.getRates() };
  }
}

/** Accepts epoch milliseconds or an ISO date; anything else is "not given". */
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const epoch = Number(value);
  if (!Number.isNaN(epoch) && epoch > 0) return new Date(epoch);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed);
}
