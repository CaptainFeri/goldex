import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminMarketService } from "./admin-market.service";
import { MarketTickerDto } from "./dto/market-ticker.dto";

@ApiTags("Admin-Market")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard)
@Controller("admin/market")
export class AdminMarketController {
  constructor(private readonly adminMarketService: AdminMarketService) {}

  @Get("ticker")
  // Every operator role sees the ticker: it is the ambient price context the
  // rest of the panel is read against, not a privileged view.
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.WAREHOUSE)
  @ApiOperation({
    summary: "Market ticker instruments with their live prices",
    description:
      "Polling companion to the websocket `prices` room, for clients that do not hold a socket " +
      "open. Prices are in the quote symbol's units (rial) — format by `quoteSlug`; the API " +
      "never converts. Direction arrows are the client's to derive by diffing successive polls, " +
      "which is why no `change` field is invented here.",
  })
  @ApiEnvelopeResponse(MarketTickerDto)
  async ticker() {
    return { data: await this.adminMarketService.getTicker() };
  }
}
