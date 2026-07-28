import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminTelegramMonitoringService } from './admin-telegram-monitoring.service';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';

@ApiTags('Admin-Telegram-Monitoring')
@ApiBearerAuth()
@Controller('admin/telegram-monitoring')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class AdminTelegramMonitoringController {
  constructor(private readonly service: AdminTelegramMonitoringService) {}

  @Get('market')
  async market() {
    return { data: await this.service.getMarketOverview() };
  }

  @Get('market/states')
  async marketStates() {
    return { data: await this.service.getAllMarketStates() };
  }

  @Get('market/state/:deliveryType')
  async marketState(@Param('deliveryType') deliveryType: string) {
    return { data: await this.service.getMarketState(deliveryType) };
  }

  @Get('market/best-buys')
  async bestBuys(@Query('limit') limit?: string) {
    return { data: await this.service.getBestBuys(this.parseLimit(limit)) };
  }

  @Get('market/best-sells')
  async bestSells(@Query('limit') limit?: string) {
    return { data: await this.service.getBestSells(this.parseLimit(limit)) };
  }

  @Get('opportunities')
  async opportunities(
    @Query('type') type?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return {
      data: await this.service.getOpportunities({
        type,
        deliveryType,
        from: this.parseTs(from),
        to: this.parseTs(to),
      }),
    };
  }

  @Get('opportunities/summary')
  async opportunitySummary() {
    return { data: await this.service.getOpportunitySummary() };
  }

  @Get('prices')
  async prices(
    @Query('subType') subType?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return {
      data: await this.service.getPrices({
        subType,
        deliveryType,
        action,
        from: this.parseTs(from),
        to: this.parseTs(to),
        limit: this.parseLimit(limit),
      }),
    };
  }

  @Get('prices/filters')
  async priceFilters() {
    return { data: await this.service.getPriceFilters() };
  }

  private parseLimit(limit?: string): number | undefined {
    const n = parseInt(limit ?? '', 10);
    if (Number.isNaN(n)) return undefined;
    return Math.min(Math.max(n, 1), 5000);
  }

  private parseTs(v?: string): number | undefined {
    if (!v) return undefined;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
    const d = Date.parse(v);
    return Number.isNaN(d) ? undefined : d;
  }
}
