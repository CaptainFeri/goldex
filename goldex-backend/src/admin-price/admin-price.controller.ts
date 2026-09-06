import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminPriceService } from "./admin-price.service";
import { PriceEngineConfigDto, UpdateEngineConfigDto } from "./dto/engine-config.dto";
import { PriceHistoryDto, PriceHistoryQueryDto } from "./dto/price-history.dto";
import {
  PriceInstrumentDto,
  PriceInstrumentQueryDto,
  PriceInstrumentsDto,
  SetInstrumentMarketStatusDto,
} from "./dto/price-instrument.dto";

/**
 * The price engine screen.
 *
 * Every route is gated on `price_engine`. The market ticker deliberately is
 * not (it renders in the panel chrome on every page) — but this screen closes
 * markets and turns price sources off, and those are the desk's decisions.
 *
 * Prices are rial, like everywhere else on this API; the panels divide by ten
 * and label it toman. See `docs/PARSZARGAR-ADMIN-API-PLAN.md` §3.1.
 */
@ApiTags("Admin-Price")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin/price")
export class AdminPriceController {
  constructor(private readonly priceService: AdminPriceService) {}

  @Get("instruments")
  @RequirePermissions("price_engine")
  @ApiOperation({
    summary: "Priceable instruments, grouped by category",
    description:
      "The catalogue is the symbol table. Instruments the desk has not given a category are " +
      "grouped under `سایر` rather than dropped, so a half-configured symbol is visible as such.",
  })
  @ApiEnvelopeResponse(PriceInstrumentsDto)
  async instruments(@Query() query: PriceInstrumentQueryDto) {
    return { data: await this.priceService.instruments(query) };
  }

  @Get("history")
  @RequirePermissions("price_engine")
  @ApiOperation({
    summary: "Recorded prices for a set of instruments, on one aligned time grid",
    description:
      "Real rows from `price_pair_histories`, bucketed so series with different report rates " +
      "line up on the same x axis. Slugs that cannot be charted come back in `missing` with a " +
      "reason instead of silently thinning the chart.",
  })
  @ApiEnvelopeResponse(PriceHistoryDto)
  async history(@Query() query: PriceHistoryQueryDto) {
    return { data: await this.priceService.historyFor(query) };
  }

  @Patch("instruments/:id/market-status")
  @RequirePermissions("price_engine")
  @ApiParam({ name: "id", format: "uuid", description: "Symbol id, from `GET /admin/price/instruments`" })
  @ApiOperation({
    summary: "Force an instrument's market open or closed",
    description:
      "Sets the admin override on every pool of the instrument's rial pair. Closing a pool " +
      "cancels the orders resting in it, so this is a confirm-gated action in the panel. Send " +
      "`open: null` to clear the override and return the pools to automatic derivation.",
  })
  @ApiEnvelopeResponse(PriceInstrumentDto)
  async setMarketStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetInstrumentMarketStatusDto,
  ) {
    return { data: await this.priceService.setMarketStatus(id, dto) };
  }

  @Get("engine-config")
  @RequirePermissions("price_engine")
  @ApiOperation({
    summary: "Price sources, spread state and the client refresh cadence",
    description:
      "`sources` are the registered providers — the same rows the providers screen shows, not a " +
      "copy. `autoSpread` is derived and read-only; it reports whether a spread is configured " +
      "and says where to change it.",
  })
  @ApiEnvelopeResponse(PriceEngineConfigDto)
  async engineConfig() {
    return { data: await this.priceService.engineConfig() };
  }

  @Patch("engine-config")
  @RequirePermissions("price_engine")
  @ApiOperation({
    summary: "Turn price sources on or off and set the refresh cadence",
    description:
      "Toggling a source publishes the same engine command the providers screen does. " +
      "`autoSpread` is accepted only when it matches the current derived value, so a client " +
      "can send the whole object back; asking to change it is a 400.",
  })
  @ApiEnvelopeResponse(PriceEngineConfigDto)
  async updateEngineConfig(@Body() dto: UpdateEngineConfigDto) {
    return { data: await this.priceService.updateEngineConfig(dto) };
  }
}
