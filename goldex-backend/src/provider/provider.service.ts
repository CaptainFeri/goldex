import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MessagePatterns } from '../rabbitmq/interfaces/rabbitmq.interfaces';
import { PricingRedisService } from '../admin-monitoring/pricing-redis.service';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    private readonly rmq: RabbitMQService,
    private readonly pricingRedis: PricingRedisService,
  ) {}

  /**
   * On boot, ask the pricing-engine for a full provider snapshot so the admin
   * mirror seeds itself with providers that already exist in the engine (and
   * not just ones created through the panel). Delayed so RabbitMQ is ready.
   */
  onModuleInit() {
    setTimeout(() => {
      void this.rmq.publishCommand(
        MessagePatterns.PROVIDER_COMMAND_RECONCILE,
        {},
      );
    }, 5000);
  }

  async create(dto: CreateProviderDto): Promise<ProviderEntity> {
    const existing = await this.providerRepo.findOne({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(`Provider key "${dto.key}" already exists`);
    }

    const entity = this.providerRepo.create({
      key: dto.key,
      category: dto.category,
      baseUrl: dto.baseUrl,
      apiBaseUrl: dto.apiBaseUrl,
      persianName: dto.persianName,
      webPanelUrl: dto.webPanelUrl,
      phone: dto.phone,
      sendOtpUrl: dto.sendOtpUrl,
      verifyCodeUrl: dto.verifyCodeUrl,
      auth: dto.auth ?? {},
      config: dto.config ?? {},
      active: dto.active ?? false,
      metadataRefreshIntervalMs: dto.metadataRefreshIntervalMs ?? 60000,
      status: 'inactive',
    });
    const saved = await this.providerRepo.save(entity);

    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_CREATE,
      this.toPayload(saved),
      saved.key,
    );
    return saved;
  }

  async findAll(): Promise<ProviderEntity[]> {
    const mirror = await this.providerRepo.find({ order: { createAt: 'ASC' } });

    // Augment the mirror with providers that are currently reporting prices to
    // the pricing-engine Redis. This guarantees providers that are alive (e.g.
    // the mocks) show up immediately, even before the RabbitMQ mirror-seed has
    // populated the `provider` table.
    let redisKeys: string[] = [];
    try {
      redisKeys = await this.pricingRedis.getProviders();
    } catch {
      redisKeys = [];
    }
    const present = new Set(mirror.map((p) => p.key));
    const missing = redisKeys.filter((k) => !present.has(k));
    if (missing.length === 0) return mirror;

    const extras = missing.map((key) =>
      this.providerRepo.create({
        key,
        category: 'unknown',
        baseUrl: '',
        active: true,
        status: 'connected',
        metadataRefreshIntervalMs: 60000,
      }),
    );
    return [...mirror, ...extras];
  }

  async findOne(id: string): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async findByKey(key: string): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({ where: { key } });
    if (!provider) throw new NotFoundException(`Provider "${key}" not found`);
    return provider;
  }

  async update(id: string, dto: UpdateProviderDto): Promise<ProviderEntity> {
    const provider = await this.findOne(id);
    Object.assign(provider, dto);
    const saved = await this.providerRepo.save(provider);

    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_UPDATE,
      this.toPayload(saved),
      saved.key,
    );
    return saved;
  }

  async toggleActive(id: string): Promise<ProviderEntity> {
    const provider = await this.findOne(id);
    provider.active = !provider.active;
    const saved = await this.providerRepo.save(provider);

    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_TOGGLE_ACTIVE,
      { key: saved.key, id: saved.id },
      saved.key,
    );
    return saved;
  }

  async sendOtp(id: string, phone: string): Promise<{ message: string }> {
    const provider = await this.findOne(id);
    provider.phone = phone;
    await this.providerRepo.save(provider);

    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_SEND_OTP,
      { key: provider.key, phone },
      provider.key,
    );
    return { message: `OTP request sent to ${phone} for provider ${provider.key}` };
  }

  async verifyOtp(id: string, otp: string): Promise<{ message: string }> {
    const provider = await this.findOne(id);
    if (!provider.phone) {
      throw new BadRequestException('No phone stored; send OTP first');
    }
    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_VERIFY_OTP,
      { key: provider.key, otp },
      provider.key,
    );
    return { message: `OTP verification submitted for provider ${provider.key}` };
  }

  async reconcile(): Promise<{ message: string }> {
    await this.rmq.publishCommand(MessagePatterns.PROVIDER_COMMAND_RECONCILE, {});
    return { message: 'Provider reconcile requested' };
  }

  async refresh(key: string): Promise<{ message: string }> {
    await this.findByKey(key);
    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_REFRESH,
      { key },
      key,
    );
    return { message: `Provider ${key} refresh requested` };
  }

  async fetchOrders(key: string): Promise<{ message: string }> {
    await this.findByKey(key);
    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_FETCH_ORDERS,
      { key },
      key,
    );
    return { message: `Order fetch requested for provider ${key}` };
  }

  async fetchBalance(key: string): Promise<{ message: string }> {
    await this.findByKey(key);
    await this.rmq.publishCommand(
      MessagePatterns.PROVIDER_COMMAND_FETCH_BALANCE,
      { key },
      key,
    );
    return { message: `Balance fetch requested for provider ${key}` };
  }

  /** Locally marks a provider's runtime status (from engine events). */
  async applyStatus(key: string, status: string): Promise<void> {
    const provider = await this.providerRepo.findOne({ where: { key } });
    if (!provider) return;
    if (provider.status === status) return;
    await this.providerRepo.update(
      { key },
      { status, lastStatusChangeAt: new Date() },
    );
  }

  /**
   * Upsert the admin mirror from an engine lifecycle payload (PROVIDER_CREATED /
   * PROVIDER_UPDATED / ACTIVATED / DEACTIVATED). Used to reconcile the mirror
   * with the engine's authoritative state after a command is applied.
   */
  async upsertFromEngine(payload: Record<string, any>): Promise<void> {
    const key = payload?.key;
    if (!key) return;
    const existing = await this.providerRepo.findOne({ where: { key } });
    const data = {
      key,
      category: payload.category ?? existing?.category ?? '',
      baseUrl: payload.baseUrl ?? existing?.baseUrl ?? '',
      apiBaseUrl: payload.apiBaseUrl ?? existing?.apiBaseUrl,
      persianName: payload.persianName ?? existing?.persianName,
      webPanelUrl: payload.webPanelUrl ?? existing?.webPanelUrl,
      phone: payload.phone ?? existing?.phone,
      sendOtpUrl: payload.sendOtpUrl ?? existing?.sendOtpUrl,
      verifyCodeUrl: payload.verifyCodeUrl ?? existing?.verifyCodeUrl,
      auth: payload.auth ?? existing?.auth ?? {},
      config: payload.config ?? existing?.config ?? {},
      active: payload.active ?? existing?.active ?? false,
      metadataRefreshIntervalMs:
        payload.metadataRefreshIntervalMs ?? existing?.metadataRefreshIntervalMs ?? 60000,
    };
    await this.providerRepo.save(this.providerRepo.create({ ...data, id: existing?.id }));
  }

  private toPayload(p: ProviderEntity): Record<string, unknown> {
    return {
      id: p.id,
      key: p.key,
      category: p.category,
      baseUrl: p.baseUrl,
      apiBaseUrl: p.apiBaseUrl,
      persianName: p.persianName,
      webPanelUrl: p.webPanelUrl,
      phone: p.phone,
      sendOtpUrl: p.sendOtpUrl,
      verifyCodeUrl: p.verifyCodeUrl,
      auth: p.auth ?? {},
      config: p.config ?? {},
      active: p.active,
      metadataRefreshIntervalMs: p.metadataRefreshIntervalMs,
    };
  }
}
