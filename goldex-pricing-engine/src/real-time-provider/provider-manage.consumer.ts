import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { ProviderService } from './provider.service';
import { ProviderManagerService } from './provider-manage.service';
import { ProviderAccountService } from './provider-account.service';
import { ProviderOrderService } from './provider-order.service';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * Consumes backend -> engine provider-management commands on the dedicated
 * command queue and delegates to the existing provider services. The engine
 * remains the authority over the `providers` table and the runtime lifecycle;
 * results are published back to the shared stream for the backend to mirror.
 */
@Injectable()
export class ProviderManageConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProviderManageConsumer.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly providerService: ProviderService,
    private readonly providerManager: ProviderManagerService,
    private readonly accountService: ProviderAccountService,
    private readonly orderService: ProviderOrderService,
    private readonly formatter: ConsoleFormatterService,
  ) {}

  onApplicationBootstrap(): void {
    void this.subscribe();
  }

  private async subscribe(): Promise<void> {
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_CREATE,
      (msg) => void this.handleCreate(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_UPDATE,
      (msg) => void this.handleUpdate(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_TOGGLE_ACTIVE,
      (msg) => void this.handleToggle(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_SEND_OTP,
      (msg) => void this.handleSendOtp(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_VERIFY_OTP,
      (msg) => void this.handleVerifyOtp(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_RECONCILE,
      () => void this.handleReconcile(),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_REFRESH,
      (msg) => void this.handleRefresh(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_FETCH_ORDERS,
      (msg) => void this.handleFetchOrders(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_FETCH_BALANCE,
      (msg) => void this.handleFetchBalance(msg),
    );
    await this.rabbitMQService.subscribeCommand(
      MessagePatterns.PROVIDER_COMMAND_PLACE_ORDER,
      (msg) => void this.handlePlaceOrder(msg),
    );
    this.formatter.log('ProviderManage', 'Subscribed to provider management commands');
  }

  private async handleCreate(msg: any): Promise<void> {
    try {
      await this.providerService.create(msg.data);
    } catch (err) {
      this.logger.error(`provider.create failed: ${this.err(err)}`);
    }
  }

  private async handleUpdate(msg: any): Promise<void> {
    try {
      const key = msg.data?.key;
      const entity = await this.providerService.findByKey(key);
      await this.providerService.update(entity.id, msg.data);
    } catch (err) {
      this.logger.error(`provider.update failed: ${this.err(err)}`);
    }
  }

  private async handleToggle(msg: any): Promise<void> {
    try {
      const key = msg.data?.key;
      const entity = await this.providerService.findByKey(key);
      await this.providerService.toggleActive(entity.id);
    } catch (err) {
      this.logger.error(`provider.toggle-active failed: ${this.err(err)}`);
    }
  }

  private async handleSendOtp(msg: any): Promise<void> {
    try {
      const { key, phone } = msg.data || {};
      const entity = await this.providerService.findByKey(key);
      await this.providerService.sendOtp(entity.id, phone);
    } catch (err) {
      this.logger.error(`provider.send-otp failed: ${this.err(err)}`);
    }
  }

  private async handleVerifyOtp(msg: any): Promise<void> {
    try {
      const { key, otp } = msg.data || {};
      const entity = await this.providerService.findByKey(key);
      await this.providerService.verifyOtp(entity.id, otp);
    } catch (err) {
      this.logger.error(`provider.verify-otp failed: ${this.err(err)}`);
    }
  }

  private async handleReconcile(): Promise<void> {
    try {
      await this.providerManager.reconcileProviders();
      // Re-broadcast the full provider set so the backend mirror stays in sync
      // with providers that predate this architecture (created directly in the
      // engine's DB, never through a backend command).
      await this.providerService.broadcastAll();
    } catch (err) {
      this.logger.error(`provider.reconcile failed: ${this.err(err)}`);
    }
  }

  private async handleRefresh(msg: any): Promise<void> {
    try {
      await this.providerManager.restartProvider(msg.data?.key);
    } catch (err) {
      this.logger.error(`provider.refresh failed: ${this.err(err)}`);
    }
  }

  private async handleFetchOrders(msg: any): Promise<void> {
    try {
      await this.accountService.fetchOrders(msg.data?.key);
    } catch (err) {
      this.logger.error(`provider.fetch-orders failed: ${this.err(err)}`);
    }
  }

  private async handleFetchBalance(msg: any): Promise<void> {
    try {
      await this.accountService.fetchBalance(msg.data?.key);
    } catch (err) {
      this.logger.error(`provider.fetch-balance failed: ${this.err(err)}`);
    }
  }

  private async handlePlaceOrder(msg: any): Promise<void> {
    try {
      const { key, itemId, dealType, count, price, clientOrderId } = msg.data || {};
      // The caller's own id is passed through so it comes back on the
      // ORDER_PLACED / ORDER_STATUS_CHANGED events and the order can be
      // matched to whatever asked for it — a customer order or a bot leg.
      await this.orderService.placeOrder({
        providerKey: key,
        itemId,
        dealType,
        count,
        price,
        clientOrderId,
      });
    } catch (err) {
      this.logger.error(`provider.place-order failed: ${this.err(err)}`);
    }
  }

  private err(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
