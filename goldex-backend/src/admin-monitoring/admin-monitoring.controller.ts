import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminMonitoringService } from "./admin-monitoring.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Monitoring")
@ApiBearerAuth()
@Controller("admin/monitoring")
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class AdminMonitoringController {
  constructor(private readonly monitoringService: AdminMonitoringService) {}

  // Provider keys that currently have data in the pricing-engine Redis.
  @Get("providers")
  async providers() {
    return { data: await this.monitoringService.getProviders() };
  }

  // Single provider/item price history series.
  @Get("history")
  async history(
    @Query("provider") provider: string,
    @Query("itemId") itemId: string,
    @Query("limit") limit?: string
  ) {
    return {
      data: await this.monitoringService.getHistory(provider, parseInt(itemId, 10), this.parseLimit(limit)),
    };
  }

  /**
   * A provider's live snapshot: item names, prices, staleness and the Goldex
   * pairs each item feeds. Also backs the item picker on the history tab, so
   * an admin never has to know a raw item id.
   */
  @Get("current/:provider")
  async current(@Param("provider") provider: string) {
    return { data: await this.monitoringService.getProviderSnapshot(provider) };
  }

  // The engine's raw price records, unshaped — kept for debugging.
  @Get("current/:provider/raw")
  async currentRaw(@Param("provider") provider: string) {
    return { data: await this.monitoringService.getCurrent(provider) };
  }

  // Best buy/sell per item across all providers (aggregated from engine Redis).
  @Get("best-prices")
  async bestPrices() {
    return { data: await this.monitoringService.getBestPrices() };
  }

  // Per-provider item + price map (aggregated from engine Redis).
  @Get("market-map")
  async marketMap() {
    return { data: await this.monitoringService.getMarketMap() };
  }

  // Consolidated market grouped by category (coins/molten/silver).
  @Get("consolidated-market")
  async consolidatedMarket() {
    return { data: await this.monitoringService.getConsolidatedMarket() };
  }

  // The comparable-chart endpoint: multi-provider series for a configured pair.
  @Get("pairs/:pairId/compare")
  async compare(
    @Param("pairId", ParseUUIDPipe) pairId: string,
    @Query("limit") limit?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return {
      data: await this.monitoringService.comparePair(
        pairId,
        this.parseLimit(limit),
        this.parseTs(from),
        this.parseTs(to)
      ),
    };
  }

  private parseLimit(limit?: string): number {
    const n = parseInt(limit ?? "", 10);
    if (Number.isNaN(n)) return 200;
    return Math.min(Math.max(n, 1), 5000);
  }

  // Accepts epoch ms or an ISO date string; returns ms or undefined.
  private parseTs(v?: string): number | undefined {
    if (!v) return undefined;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
    const d = Date.parse(v);
    return Number.isNaN(d) ? undefined : d;
  }
}
