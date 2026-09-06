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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
} from '../shared/swagger';
import {
  ProviderBalanceSnapshotDto,
  ProviderCommandAckDto,
  ProviderDealSnapshotDto,
  ProviderDto,
  ProviderPriceItemDto,
  ProviderStatusDto,
} from './dto/provider-response.dto';
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
@ApiAdminErrorResponses()
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
  @ApiOperation({ summary: 'Register a pricing provider' })
  @ApiEnvelopeResponse(ProviderDto, { status: 201 })
  async create(@Body() dto: CreateProviderDto) {
    return { data: await this.providerService.create(dto) };
  }

  @Get()
  @ApiOperation({ summary: 'All pricing providers' })
  @ApiEnvelopeResponse(ProviderDto, { isArray: true })
  async findAll() {
    return { data: await this.providerService.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one provider' })
  @ApiEnvelopeResponse(ProviderDto)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.providerService.findOne(id) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a provider' })
  @ApiEnvelopeResponse(ProviderDto)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProviderDto) {
    return { data: await this.providerService.update(id, dto) };
  }

  @Post(':id/toggle-active')
  @ApiOperation({ summary: 'Turn a provider on or off' })
  @ApiEnvelopeResponse(ProviderDto, { status: 201 })
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.providerService.toggleActive(id) };
  }

  @Post(':id/send-otp')
  @ApiOperation({ summary: 'Send the provider activation OTP' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async sendOtp(@Param('id', ParseUUIDPipe) id: string, @Body('phone') phone: string) {
    return { data: await this.providerService.sendOtp(id, phone) };
  }

  @Post(':id/verify-otp')
  @ApiOperation({ summary: 'Verify the provider activation OTP' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async verifyOtp(@Param('id', ParseUUIDPipe) id: string, @Body('otp') otp: string) {
    return { data: await this.providerService.verifyOtp(id, otp) };
  }

  @Post('reconcile')
  @ApiOperation({
    summary: 'Ask the pricing engine to reconcile every provider',
    description: 'Queues the command and returns immediately — poll provider status for the outcome',
  })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async reconcile() {
    return { data: await this.providerService.reconcile() };
  }

  @Post(':providerKey/refresh')
  @ApiOperation({ summary: "Refresh one provider's metadata" })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async refresh(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.refresh(providerKey) };
  }

  @Get(':providerKey/items')
  @ApiOperation({
    summary: "A provider's live prices",
    description: "Read from the pricing engine's Redis, so these are the latest ticks rather than a stored snapshot",
  })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderPriceItemDto, { isArray: true })
  async items(@Param('providerKey') providerKey: string) {
    return { data: await this.pricingRedis.getProviderItems(providerKey) };
  }

  @Get(':providerKey/orders')
  @ApiOperation({ summary: 'Aggregated trading activity with this provider, per instrument' })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderDealSnapshotDto, { isArray: true })
  async orders(@Param('providerKey') providerKey: string) {
    const rows = await this.dealRepo.find({
      where: { providerKey },
      order: { updatedAt: 'DESC' },
    });
    return { data: rows };
  }

  @Post(':providerKey/fetch-orders')
  @ApiOperation({ summary: "Ask the engine to pull this provider's orders" })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async fetchOrders(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.fetchOrders(providerKey) };
  }

  @Get(':providerKey/balance')
  @ApiOperation({ summary: "A provider's last reported balances" })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderBalanceSnapshotDto, { description: 'Null when no balance has been reported yet' })
  async balance(@Param('providerKey') providerKey: string) {
    const row = await this.balanceRepo.findOne({
      where: { providerKey },
    });
    return { data: row };
  }

  @Post(':providerKey/fetch-balance')
  @ApiOperation({ summary: "Ask the engine to pull this provider's balance" })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async fetchBalance(@Param('providerKey') providerKey: string) {
    return { data: await this.providerService.fetchBalance(providerKey) };
  }

  @Get(':providerKey/status')
  @ApiOperation({ summary: "A provider's connection state" })
  @ApiParam({ name: 'providerKey', example: 'talaab' })
  @ApiEnvelopeResponse(ProviderStatusDto)
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