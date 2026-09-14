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
    // Activation changes the provider's stored auth and its active flag, and
    // the panel refetches the moment the request returns. Without these the
    // mirror only caught up on the engine's 30-second registry tick, so a
    // provider that had just been activated still read as inactive.
    this.rmq.subscribe(MessagePatterns.PROVIDER_OTP_VERIFIED, (m) => this.onLifecycle(m));
    this.rmq.subscribe(MessagePatterns.PROVIDER_OTP_FAILED, (m) => this.onOtpFailed(m));
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

  /**
   * Records a failed activation attempt where an operator can find it later.
   *
   * The admin who typed the code already has the reason in their response; this
   * is the trace for afterwards — why a provider that someone tried to turn on
   * is still off. Deliberately not written to `status`, which is the runtime
   * connection state: a provider whose activation was refused is not in a
   * connection error, it was simply never activated, and reporting it as
   * "error" in the list would say something untrue about the connection.
   */
  private onOtpFailed(msg: RabbitMQMessage): void {
    const key = msg.data?.key || msg.providerKey || 'unknown';
    this.logger.warn(
      `Activation failed for provider ${key} at ${msg.data?.stage ?? 'unknown stage'}: ${msg.data?.error ?? 'no reason given'}`,
    );
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