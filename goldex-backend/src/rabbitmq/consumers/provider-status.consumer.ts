import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq.service';
import {
  MessagePatterns,
  RabbitMQMessage,
} from '../interfaces/rabbitmq.interfaces';
import { ProviderService } from '../../provider/provider.service';

/**
 * Keeps the backend's admin-facing provider mirror in sync with the
 * pricing-engine by consuming provider lifecycle + status events.
 */
@Injectable()
export class ProviderStatusConsumer implements OnModuleInit {
  private readonly logger = new Logger(ProviderStatusConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly providerService: ProviderService,
  ) {}

  onModuleInit() {
    this.rmq.subscribe(MessagePatterns.PROVIDER_CREATED, (m) => this.onLifecycle(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_UPDATED, (m) => this.onLifecycle(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_ACTIVATED, (m) => this.onLifecycle(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_DEACTIVATED, (m) => this.onLifecycle(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_CONNECTED, (m) => this.onConnected(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_DISCONNECTED, (m) => this.onDisconnected(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_STATUS_CHANGED, (m) => this.onStatusChanged(m));
  }

  private async onLifecycle(msg: RabbitMQMessage): Promise<void> {
    try {
      await this.providerService.upsertFromEngine(msg.data);
    } catch (err) {
      this.logger.error(`provider lifecycle sync failed: ${(err as Error).message}`);
    }
  }

  private async onConnected(msg: RabbitMQMessage): Promise<void> {
    try {
      const key = msg.data?.key || msg.providerKey;
      if (key) await this.providerService.applyStatus(key, 'connected');
    } catch (err) {
      this.logger.error(`provider connected sync failed: ${(err as Error).message}`);
    }
  }

  private async onDisconnected(msg: RabbitMQMessage): Promise<void> {
    try {
      const key = msg.data?.key || msg.providerKey;
      if (key) await this.providerService.applyStatus(key, 'disconnected');
    } catch (err) {
      this.logger.error(`provider disconnected sync failed: ${(err as Error).message}`);
    }
  }

  private async onStatusChanged(msg: RabbitMQMessage): Promise<void> {
    try {
      const key = msg.data?.key || msg.providerKey;
      if (!key) return;
      const online = msg.data?.onlineStatus ?? msg.data?.online;
      await this.providerService.applyStatus(key, online ? 'connected' : 'disconnected');
    } catch (err) {
      this.logger.error(`provider status sync failed: ${(err as Error).message}`);
    }
  }
}