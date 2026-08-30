import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';
import { PricingRedisService } from '../admin-monitoring/pricing-redis.service';
import { ProviderDealSnapshotEntity } from '../financial/entity/provider-deal-snapshot.entity';
import { ProviderBalanceSnapshotEntity } from '../financial/entity/provider-balance-snapshot.entity';

@ApiTags('Admin-Provider')
@ApiBearerAuth()
@Controller('admin/providers')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
export class ProviderController {
  constructor(
    private readonly providerService: ProviderService,
    private readonly pricingRedis: PricingRedisService,
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly dealRepo: Repository<ProviderDealSnapshotEntity>,
    @InjectRepository(ProviderBalanceSnapshotEntity)
    private readonly balanceRepo: Repository<ProviderBalanceSnapshotEntity>,
  ) {}

  @Post()
  async create(@Body() dto: CreateProviderDto) {
    return { data: await this.providerService.create(dto) };
  }

  @Get()
  async findAll() {
    return { data: await this.providerService.findAll() };
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.providerService.findOne(id) };
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProviderDto) {
    return { data: await this.providerService.update(id, dto) };
  }

  @Post(':id/toggle-active')
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.providerService.toggleActive(id) };
  }

  @Post(':id/send-otp')
  async sendOtp(@Param('id', ParseUUIDPipe) id: string, @Body('phone') phone: string) {
    return { data: await this.providerService.sendOtp(id, phone) };
  }

  @Post(':id/verify-otp')
  async verifyOtp(@Param('id', ParseUUIDPipe) id: string, @Body('otp') otp: string) {
    return { data: await this.providerService.verifyOtp(id, otp) };
  }

  @Post('reconcile')
  async reconcile() {
    return { data: await this.providerService.reconcile() };
  }

  @Post(':providerKey/refresh')
  async refresh(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.refresh(providerKey) };
  }

  @Get(':providerKey/items')
  async items(@Param('providerKey') providerKey: string) {
    return { data: await this.pricingRedis.getProviderItems(providerKey) };
  }

  @Get(':providerKey/orders')
  async orders(@Param('providerKey') providerKey: string) {
    const rows = await this.dealRepo.find({
      where: { providerKey },
      order: { updatedAt: 'DESC' },
    });
    return { data: rows };
  }

  @Post(':providerKey/fetch-orders')
  async fetchOrders(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.fetchOrders(providerKey) };
  }

  @Get(':providerKey/balance')
  async balance(@Param('providerKey') providerKey: string) {
    const row = await this.balanceRepo.findOne({
      where: { providerKey },
    });
    return { data: row };
  }

  @Post(':providerKey/fetch-balance')
  async fetchBalance(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.fetchBalance(providerKey) };
  }

  @Get(':providerKey/status')
  async status(@Param('providerKey') providerKey: string) {
    const provider = await this.providerService.findByKey(providerKey);
    return {
      data: {
        key: provider.key,
        category: provider.category,
        active: provider.active,
        status: provider.status,
        lastStatusChangeAt: provider.lastStatusChangeAt,
      },
    };
  }
}