import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity } from './entity/provider.entity';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderManagerService } from './provider-manage.service';
import { OtpHandler } from './types/otp.types';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(ProviderEntity)
    private providerRepo: Repository<ProviderEntity>,
    private readonly providerManager: ProviderManagerService,
    @Inject('OTP_HANDLERS')
    private readonly otpHandlers: Map<string, OtpHandler>,
    private readonly formatter: ConsoleFormatterService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  async create(data: CreateProviderDto): Promise<ProviderEntity> {
    const provider = this.providerRepo.create({
      ...data,
      active: data.active ?? false,
      auth: data.auth ?? {},
      config: data.config ?? {},
    });
    const saved = await this.providerRepo.save(provider);
    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(MessagePatterns.PROVIDER_CREATED, saved, saved.key);
    }
    return saved;
  }

  async findAll(): Promise<ProviderEntity[]> {
    return this.providerRepo.find();
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

    Object.assign(provider, data);
    const saved = await this.providerRepo.save(provider);

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
