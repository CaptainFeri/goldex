import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminArbitrageService } from './admin-arbitrage.service';
import { UpdateArbitrageConfigDto } from './dto/update-arbitrage-config.dto';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';

@ApiTags('Admin-Arbitrage')
@ApiBearerAuth()
@Controller('admin/arbitrage')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class AdminArbitrageController {
  constructor(private readonly arbitrageService: AdminArbitrageService) {}

  @Get('opportunities')
  @ApiOperation({ summary: 'Currently detected arbitrage opportunities' })
  async opportunities() {
    return { data: await this.arbitrageService.getOpportunities() };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Freshly detected signals, newest first' })
  async alerts() {
    return { data: await this.arbitrageService.getAlerts() };
  }

  @Get('last-scan')
  @ApiOperation({ summary: 'Metadata of the most recent scan' })
  async lastScan() {
    return { data: await this.arbitrageService.getLastScan() };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Which source answered, how fresh it is, and whether the engine is reachable',
  })
  async status() {
    return { data: await this.arbitrageService.getStatus() };
  }

  @Get('history')
  @ApiOperation({ summary: 'Recently detected signals from the engine history' })
  async history(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return {
      data: await this.arbitrageService.getHistory(Number.isFinite(parsed) ? parsed : 100),
    };
  }

  @Get('config')
  @ApiOperation({ summary: "The engine's live scan config, as last reported" })
  async config() {
    // Nudge the engine to republish so a first visit isn't blank.
    await this.arbitrageService.requestStats();
    return { data: await this.arbitrageService.getConfig() };
  }

  @Patch('config')
  @ApiOperation({ summary: 'Push a scan-config change to the pricing-engine' })
  async updateConfig(@Body() dto: UpdateArbitrageConfigDto) {
    await this.arbitrageService.updateConfig(dto);
    return { data: { accepted: true } };
  }

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the pricing-engine to scan immediately' })
  async scan() {
    await this.arbitrageService.requestScan();
    return { data: { accepted: true } };
  }
}
