import { Body, Controller, Get, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import {
  AccountingHoldingsDto,
  AccountingRatesDto,
  AccountingSettingsDto,
  AccountingSummaryDto,
} from "./dto/accounting-response.dto";
import { AccountingService } from "./accounting.service";
import { AccountingSettingService } from "./accounting-setting.service";
import { UpdateAccountingSettingDto } from "./dto/update-accounting-setting.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";

/**
 * Valuation of the books at live prices.
 *
 * `admin/accounting` proper is the general ledger and vouchers (see
 * `admin-accounting`); this sits beneath it as the marking-to-market view, so
 * the two never compete for a route.
 */
@ApiTags("Admin-Accounting-Valuation")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions("accounting")
@Controller("admin/accounting/valuation")
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly settings: AccountingSettingService
  ) {}

  @Get("settings")
  @ApiOperation({ summary: "Accounting policy: reference (pricing) symbol and valuation basis" })
  @ApiEnvelopeResponse(AccountingSettingsDto)
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
  @ApiOperation({ summary: "Choose the pricing symbol the books are reported in" })
  @ApiEnvelopeResponse(AccountingSettingsDto)
  async updateSettings(@Body() dto: UpdateAccountingSettingDto, @Req() req: any) {
    return { data: await this.settings.update(dto, req?.admin?.id) };
  }

  @Get("summary")
  @ApiOperation({
    summary: "Profit, cost and net profit per asset, valued at live prices in the reference symbol",
  })
  @ApiEnvelopeResponse(AccountingSummaryDto)
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
  @ApiOperation({ summary: "Customer and system balances valued in the reference symbol" })
  @ApiEnvelopeResponse(AccountingHoldingsDto)
  async holdings() {
    return { data: await this.accounting.getHoldings() };
  }

  @Get("rates")
  @ApiOperation({ summary: "Live conversion rate from each symbol into the reference" })
  @ApiEnvelopeResponse(AccountingRatesDto)
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
