import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderManagerService } from './provider-manage.service';
import { OtpHandler } from './types/otp.types';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import {
  clearProxyRoutes,
  registerProxyRoute,
} from '../common/http/proxy-route.registry';

@Injectable()
export class ProviderService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(ProviderEntity)
    private providerRepo: Repository<ProviderEntity>,
    private readonly providerManager: ProviderManagerService,
    @Inject('OTP_HANDLERS')
    private readonly otpHandlers: Map<string, OtpHandler>,
    private readonly formatter: ConsoleFormatterService,
    private readonly redisService: RedisService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Routes first: a provider that starts connecting before its hosts are
    // declared would be routed by the process-wide default instead of its own
    // `useProxy`, and a wrongly-routed first connection just fails.
    await this.syncProxyRoutes().catch(() => undefined);

    // Keep the admin panel's provider registry fresh regardless of whether any
    // RabbitMQ reconcile message arrives. Written directly to the shared pricing
    // Redis so the backend can list ALL providers (active AND inactive).
    await this.publishRegistry().catch(() => undefined);
    setInterval(() => void this.publishRegistry().catch(() => undefined), 30000);
  }

  /**
   * Republishes every provider's `useProxy` to the host registry the HTTP and
   * WebSocket agents consult.
   *
   * Rebuilt whole rather than patched, so a host stops being routed once the
   * provider that claimed it stops claiming it — an edited baseUrl would
   * otherwise leave its old host behind, declared forever.
   */
  async syncProxyRoutes(): Promise<void> {
    const entities = await this.providerRepo.find();
    clearProxyRoutes();
    for (const entity of entities) {
      this.registerProxyRoutes(entity);
    }
  }

  /** Declares every host one provider talks to, all under its own flag. */
  private registerProxyRoutes(provider: ProviderEntity): void {
    const urls = [
      provider.baseUrl,
      provider.apiBaseUrl,
      provider.sendOtpUrl,
      provider.verifyCodeUrl,
      provider.webPanelUrl,
      provider.config?.originUrl as string | undefined,
    ];
    for (const url of urls) {
      if (!url) continue;
      registerProxyRoute(url, provider.useProxy ?? true, (message) =>
        this.formatter.warn('ProviderService', message),
      );
    }
  }

  /**
   * Writes the full provider set (active + inactive) into the pricing Redis under
   * `providers:registry`, so the backend's admin mirror can show and manage every
   * provider without depending on ephemeral RabbitMQ events.
   */
  async publishRegistry(): Promise<void> {
    const entities = await this.providerRepo.find();
    await this.redisService.setJson('providers:registry', entities, 3600);
  }

  /**
   * Strips the fields this service alone owns from an inbound payload.
   *
   * Commands arrive from the backend carrying that service's *own* row —
   * including its `id`, which is a different UUID for the same provider. Let
   * that through into an `Object.assign` and it rewrites the primary key: the
   * following `save()` either updates nothing or tries to insert a duplicate
   * `key`. Providers are addressed by `key` on both sides, so identity and
   * timestamps never travel with a command.
   */
  private stripOwnedFields<T extends Record<string, any>>(data: T): T {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...rest } = data ?? ({} as T);
    return rest as T;
  }

  async create(data: CreateProviderDto): Promise<ProviderEntity> {
    const clean = this.stripOwnedFields(data);
    const provider = this.providerRepo.create({
      ...clean,
      active: clean.active ?? false,
      auth: clean.auth ?? {},
      config: clean.config ?? {},
    });
    const saved = await this.providerRepo.save(provider);
    this.registerProxyRoutes(saved);
    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(MessagePatterns.PROVIDER_CREATED, saved, saved.key);
    }
    return saved;
  }

  async findAll(): Promise<ProviderEntity[]> {
    return this.providerRepo.find();
  }

  /**
   * Broadcast every provider's full entity back on the shared stream so the
   * backend's admin mirror can (re)seed itself. Idempotent — the backend upserts
   * by `key`. Called after a reconcile so existing providers (e.g. the mocks)
   * appear in the panel even though they were never "created" via a command.
   */
  async broadcastAll(): Promise<void> {
    if (!this.rabbitMQService) return;
    const entities = await this.providerRepo.find();
    for (const entity of entities) {
      await this.rabbitMQService.publish(
        MessagePatterns.PROVIDER_CREATED,
        entity,
        entity.key,
      );
    }
    await this.publishRegistry().catch(() => undefined);
  }

  async findOne(id: string): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async findByKey(key: string): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({ where: { key } });
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  async update(id: string, data: Partial<CreateProviderDto>): Promise<ProviderEntity> {
    const provider = await this.findOne(id);
    const isRunning = !!this.providerManager.getProvider(provider.key);

    Object.assign(provider, this.stripOwnedFields(data));
    const saved = await this.providerRepo.save(provider);
    // Rebuilt, not added to: this edit may have moved the provider off a host
    // it previously claimed, and that host must stop being routed.
    await this.syncProxyRoutes();

    if (data.auth !== undefined && isRunning) {
      this.formatter.log('ProviderService', `restart-${provider.key} (auth changed)`);
      await this.providerManager.restartProvider(saved.key);
    } else if (data.active === false && isRunning) {
      this.formatter.log('ProviderService', `stop-${provider.key}`);
      await this.providerManager.stopProvider(saved.key);
    } else if (data.active === true && !isRunning) {
      this.formatter.log('ProviderService', `start-${provider.key}`);
      void this.providerManager.startProvider(saved);
    } else if (data.active === undefined && isRunning) {
      this.formatter.log('ProviderService', `restart-${provider.key}`);
      await this.providerManager.restartProvider(saved.key);
    }

    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(MessagePatterns.PROVIDER_UPDATED, saved, saved.key);
    }

    return saved;
  }

  async toggleActive(id: string): Promise<ProviderEntity> {
    const provider = await this.findOne(id);
    provider.active = !provider.active;
    const saved = await this.providerRepo.save(provider);
    if (saved.active) {
      this.formatter.log('ProviderService', `start-${provider.key}`);
      void this.providerManager.startProvider(saved);
      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(MessagePatterns.PROVIDER_ACTIVATED, saved, saved.key);
      }
    } else {
      this.formatter.log('ProviderService', `stop-${provider.key}`);
      await this.providerManager.stopProvider(saved.key);
      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(MessagePatterns.PROVIDER_DEACTIVATED, saved, saved.key);
      }
    }
    return saved;
  }

  async sendOtp(id: string, phone: string): Promise<{ message: string }> {
    const provider = await this.findOne(id);
    if (provider.active) {
      throw new BadRequestException('Provider is already active; cannot send OTP');
    }
    provider.phone = phone;
    delete provider.auth.token;
    delete provider.auth.otp;
    await this.providerRepo.save(provider);

    const handler = this.otpHandlers.get(provider.category);
    if (!handler) {
      throw new BadRequestException(`No OTP handler for category ${provider.category}`);
    }
    try {
      await handler.sendOtp(provider, phone);
      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(MessagePatterns.PROVIDER_OTP_SENT, { key: provider.key, phone }, provider.key);
      }
      return { message: `OTP sent to ${phone} for provider ${provider.key}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.formatter.error('ProviderService', `sendOtp error: ${message}`);
      throw new BadRequestException(`Failed to send OTP: ${message}`);
    }
  }

  async verifyOtp(id: string, otp: string): Promise<ProviderEntity> {
    const provider = await this.findOne(id);
    if (provider.active) {
      throw new BadRequestException('Provider is already active');
    }
    if (!provider.phone) {
      throw new BadRequestException('No phone number stored; send OTP first');
    }

    const handler = this.otpHandlers.get(provider.category);
    if (!handler) {
      throw new BadRequestException(`No OTP handler for category ${provider.category}`);
    }

    try {
      const { token, extra } = await handler.verifyOtp(provider, otp);
      provider.auth.token = token;
      if (extra) {
        Object.assign(provider.auth, extra);
      }
      provider.active = true;
      const saved = await this.providerRepo.save(provider);
      void this.providerManager.startProvider(saved);
      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(MessagePatterns.PROVIDER_OTP_VERIFIED, saved, saved.key);
      }
      return saved;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.formatter.error('ProviderService', `verifyOtp error: ${message}`);
      throw new BadRequestException(`OTP verification failed: ${message}`);
    }
  }
}
