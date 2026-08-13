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
   * mirror seeds itself with providers that already exist in the engine (active
   * and inactive) — not just ones created through the panel. Retried until the
   * mirror has rows (or a max number of attempts) so it works even when
   * RabbitMQ connects after the first attempt.
   */
  onModuleInit() {
    const attempt = async (remaining: number): Promise<void> => {
      if (remaining <= 0) return;
      try {
        const count = await this.providerRepo.count();
        if (count > 0) return; // already seeded
      } catch {
        /* table may not be ready yet */
      }
      await this.rmq.publishCommand(MessagePatterns.PROVIDER_COMMAND_RECONCILE, {});
      setTimeout(() => void attempt(remaining - 1), 10000);
    };
    setTimeout(() => void attempt(20), 3000);
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

    // Merge three sources so EVERY provider is listed — active and inactive:
    //  1. `providers:registry` — the pricing-engine's authoritative full list
    //     (all providers in its DB, written to Redis on an interval).
    //  2. the local mirror (`provider` table) — includes providers created
    //     through the panel that may not be in the engine yet.
    //  3. pricing-Redis keys of providers currently reporting prices.
    let liveKeys: string[] = [];
    let registry: Record<string, any>[] = [];
    try {
      liveKeys = await this.pricingRedis.getProviders();
      registry = await this.pricingRedis.getRegistry();
    } catch {
      /* pricing redis unavailable */
    }
    const liveSet = new Set(liveKeys);
    const mirrorByKey = new Map(mirror.map((p) => [p.key, p]));
    const seen = new Set<string>();
    const result: ProviderEntity[] = [];

    for (const reg of registry) {
      const key = reg?.key;
      if (!key) continue;
      const m = mirrorByKey.get(key);
      const entity = this.providerRepo.create({
        id: m?.id,
        key,
        category: reg.category ?? m?.category ?? 'unknown',
        baseUrl: reg.baseUrl ?? m?.baseUrl ?? '',
        apiBaseUrl: reg.apiBaseUrl ?? m?.apiBaseUrl,
        persianName: reg.persianName ?? m?.persianName,
        webPanelUrl: reg.webPanelUrl ?? m?.webPanelUrl,
        phone: reg.phone ?? m?.phone,
        sendOtpUrl: reg.sendOtpUrl ?? m?.sendOtpUrl,
        verifyCodeUrl: reg.verifyCodeUrl ?? m?.verifyCodeUrl,
        auth: reg.auth ?? m?.auth ?? {},
        config: reg.config ?? m?.config ?? {},
        active: reg.active ?? m?.active ?? false,
        metadataRefreshIntervalMs:
          reg.metadataRefreshIntervalMs ?? m?.metadataRefreshIntervalMs ?? 60000,
        status: m?.status ?? (liveSet.has(key) ? 'connected' : 'disconnected'),
        lastStatusChangeAt: m?.lastStatusChangeAt,
      });
      result.push(entity);
      seen.add(key);
    }

    for (const m of mirror) {
      if (seen.has(m.key)) continue;
      result.push(m);
      seen.add(m.key);
    }

    for (const key of liveKeys) {
      if (seen.has(key)) continue;
      result.push(
        this.providerRepo.create({
          key,
          category: 'unknown',
          baseUrl: '',
          active: true,
          status: 'connected',
          metadataRefreshIntervalMs: 60000,
        }),
      );
      seen.add(key);
    }

    return result;
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
