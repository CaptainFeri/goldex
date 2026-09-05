import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketStatusService } from './market-status.service';
import { MarketPoolType, MarketStatus } from './entity/pair-pool-status.entity';
import { SetOverrideDto } from './dto/set-override.dto';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';

@ApiTags('Admin-Market-Status')
@ApiBearerAuth()
@Controller('admin/market-status')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
export class MarketStatusController {
  constructor(private readonly statusService: MarketStatusService) {}

  @Get()
  @ApiOperation({ summary: 'Every pair × pool, including rows never reconciled' })
  async getAll() {
    return { data: await this.statusService.getAll() };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Counts of open / closed / overridden pools' })
  async summary() {
    return { data: await this.statusService.getSummary() };
  }

  @Get('pairs/:pairId')
  async getForPair(@Param('pairId', ParseUUIDPipe) pairId: string) {
    return { data: await this.statusService.getForPair(pairId) };
  }

  /**
   * Set (or clear, with status='null') the admin override for every pool of a
   * pair at once — the "close this pair" action.
   */
  @Patch('pairs/:pairId/override')
  @ApiOperation({ summary: 'Force every pool of a pair open or closed' })
  async setPairOverride(
    @Param('pairId', ParseUUIDPipe) pairId: string,
    @Body() dto: SetOverrideDto,
  ) {
    return { data: await this.statusService.setOverrideForPair(pairId, this.resolve(dto)) };
  }

  /**
   * Set (or clear, with status='null') the admin override for a pool on a pair.
   */
  @Patch('pairs/:pairId/:poolType/override')
  async setOverride(
    @Param('pairId', ParseUUIDPipe) pairId: string,
    @Param('poolType', new ParseEnumPipe(MarketPoolType)) poolType: MarketPoolType,
    @Body() dto: SetOverrideDto,
  ) {
    return { data: await this.statusService.setOverride(pairId, poolType, this.resolve(dto)) };
  }

  private resolve(dto: SetOverrideDto): MarketStatus | null {
    return dto.status === 'null' || dto.status == null ? null : (dto.status as MarketStatus);
  }
}
