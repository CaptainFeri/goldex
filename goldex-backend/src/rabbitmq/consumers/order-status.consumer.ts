import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMQService } from '../rabbitmq.service';
import {
  MessagePatterns,
  RabbitMQMessage,
} from '../interfaces/rabbitmq.interfaces';
import { OrderEntity } from '../../order/order.entity';
import { WalletOrderService } from '../../wallet/services/wallet-order.service';
import { OrderStatusEnum } from '../../order/enum/order.status.enum';

interface OrderPlacedData {
  providerKey: string;
  orderId: string;
  itemId: number;
  dealType: number;
  count: number;
  clientOrderId?: string;
  status: number;
  statusStr: string;
}

interface OrderStatusChangedData {
  providerKey: string;
  orderId: string;
  itemId: number;
  dealType: number;
  count: number;
  clientOrderId?: string;
  status: number;
  statusStr: string;
}

@Injectable()
export class OrderStatusConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderStatusConsumer.name);
  private readonly terminalStatuses = new Set([
    OrderStatusEnum.COMPLETED,
    OrderStatusEnum.REJECTED,
    OrderStatusEnum.CANCELLED,
  ]);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly walletOrderService: WalletOrderService,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  async onModuleInit() {
    await this.rmq.subscribe(
      MessagePatterns.ORDER_PLACED,
      (msg: RabbitMQMessage) => this.handleOrderPlaced(msg),
    );
    await this.rmq.subscribe(
      MessagePatterns.ORDER_STATUS_CHANGED,
      (msg: RabbitMQMessage) => this.handleStatusChanged(msg),
    );
  }

  private async handleOrderPlaced(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as OrderPlacedData;
      if (!data.clientOrderId) return;

      await this.orderRepo.update(data.clientOrderId, {
        providerOrderId: data.orderId,
      });

      this.logger.log(
        `Order ${data.clientOrderId} linked to provider order ${data.orderId} [${data.providerKey}]`,
      );
    } catch (err) {
      this.logger.error(`handleOrderPlaced failed: ${(err as Error).message}`);
    }
  }

  private async handleStatusChanged(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as OrderStatusChangedData;
      if (!data.clientOrderId) {
        this.logger.warn('ORDER_STATUS_CHANGED missing clientOrderId');
        return;
      }

      const order = await this.orderRepo.findOne({
        where: { id: data.clientOrderId },
        relations: {
          pricePair: { baseSymbol: true, quoteSymbol: true },
        },
      });

      if (!order) {
        this.logger.warn(
          `No order found for clientOrderId=${data.clientOrderId}`,
        );
        return;
      }

      if (this.terminalStatuses.has(order.status as OrderStatusEnum)) {
        this.logger.log(
          `Order ${order.orderCode} already in terminal state ${order.status}, skipping`,
        );
        return;
      }

      if (data.orderId && !order.providerOrderId) {
        order.providerOrderId = data.orderId;
        await this.orderRepo.save(order);
      }

      if (!order.pricePair) {
        this.logger.warn(`PricePair not found for order ${order.orderCode}`);
        return;
      }

      const isConfirmed = data.status === 1;
      const isFailed = data.status !== 1;

      if (isConfirmed) {
        await this.walletOrderService.confirmOrderExecution(order, order.pricePair);
        this.logger.log(`Order ${order.orderCode} confirmed, wallets updated`);
      } else if (isFailed) {
        await this.walletOrderService.rejectOrder(order, order.pricePair);
        this.logger.log(`Order ${order.orderCode} failed, balance unlocked`);
      }
    } catch (err) {
      this.logger.error(`ORDER_STATUS_CHANGED handler failed: ${(err as Error).message}`);
    }
  }
}
