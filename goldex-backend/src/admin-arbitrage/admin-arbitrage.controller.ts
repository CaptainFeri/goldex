import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminArbitrageService } from './admin-arbitrage.service';
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
  async opportunities() {
    return { data: await this.arbitrageService.getOpportunities() };
  }

  @Get('alerts')
  async alerts() {
    return { data: await this.arbitrageService.getAlerts() };
  }

  @Get('last-scan')
  async lastScan() {
    return { data: await this.arbitrageService.getLastScan() };
  }
}
