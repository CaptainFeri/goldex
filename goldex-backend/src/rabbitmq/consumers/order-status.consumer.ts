import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMQService } from '../rabbitmq.service';
import {
  MessagePatterns,
  RabbitMQMessage,
} from '../interfaces/rabbitmq.interfaces';
import { OrderEntity } from '../../order/order.entity';
import { CreditEntity } from '../../credit/entity/credit.entity';
import { CreditOrderEntity } from '../../credit/entity/credit-order.entity';
import { CreditOrderStatusEnum } from '../../credit/enum/credit-order-status.enum';
import { CollateralLockEntity } from '../../credit/entity/collateral-lock.entity';
import { CollateralLockStatusEnum } from '../../credit/enum/collateral-lock-status.enum';
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
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CollateralLockEntity)
    private readonly collateralLockRepo: Repository<CollateralLockEntity>,
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
        // A confirmed credit order is a completed hop — only completed orders
        // count toward the execution/hops limits.
        if (order.isCreditLinked) {
          await this.markCreditOrder(order, CreditOrderStatusEnum.COMPLETED);
        }
        this.logger.log(`Order ${order.orderCode} confirmed, wallets updated`);
      } else if (isFailed) {
        await this.walletOrderService.rejectOrder(order, order.pricePair);
        // A failed order never completes — release its credit link.
        if (order.isCreditLinked) {
          await this.markCreditOrder(order, CreditOrderStatusEnum.CANCELLED);
        }
        this.logger.log(`Order ${order.orderCode} failed, balance unlocked`);
      }
    } catch (err) {
      this.logger.error(`ORDER_STATUS_CHANGED handler failed: ${(err as Error).message}`);
    }
  }

  private async markCreditOrder(
    order: OrderEntity,
    status: CreditOrderStatusEnum,
  ): Promise<void> {
    const creditOrder = await this.creditOrderRepo.findOne({
      where: { orderId: order.id, status: CreditOrderStatusEnum.ACTIVE },
    });
    if (!creditOrder) return;
    creditOrder.status = status;
    await this.creditOrderRepo.save(creditOrder);
    if (status === CreditOrderStatusEnum.CANCELLED) {
      // Release the per-trade collateral lock — the exposure never opened.
      const locks = await this.collateralLockRepo.find({
        where: { creditOrderId: creditOrder.id, status: CollateralLockStatusEnum.ACTIVE },
      });
      for (const lock of locks) {
        lock.status = CollateralLockStatusEnum.RELEASED;
        lock.releasedAt = new Date();
        await this.collateralLockRepo.save(lock);
      }
    }
    if (status === CreditOrderStatusEnum.COMPLETED) {
      await this.creditRepo.increment(
        { id: creditOrder.creditId },
        'executedTradeLevel',
        1,
      );
    }
  }
}
