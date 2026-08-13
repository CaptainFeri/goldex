import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrderEntity } from '../order/order.entity';
import { OrderStatusEnum } from '../order/enum/order.status.enum';
import { OrderTypeEnum } from '../order/enum/order.type.enum';
import { WalletOrderService } from '../wallet/services/wallet-order.service';
import { OrderBookService } from '../order-book/order-book.service';
import { MarketPoolType } from './entity/pair-pool-status.entity';

/**
 * Closes all pending / partially-completed orders of a given pool on a
 * price-pair and releases the locked wallet balances. Local close only — no
 * cancellation is sent back to any provider.
 */
@Injectable()
export class MarketCloseService {
  private readonly logger = new Logger(MarketCloseService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly walletOrderService: WalletOrderService,
    private readonly orderBookService: OrderBookService,
  ) {}

  async closePool(pairId: string, poolType: MarketPoolType): Promise<number> {
    // For the LIMIT pool, first evict the resting orders from the in-memory
    // book so they can no longer be matched while we cancel them in the DB.
    if (poolType === MarketPoolType.LIMIT) {
      const removed = this.orderBookService.clearRestingForPair(pairId);
      this.logger.log(`LIMIT pool: removed ${removed.length} resting order(s) from book for pair ${pairId}`);
    }

    const orders = await this.orderRepo.find({
      where: {
        pricePairId: pairId,
        orderType: poolType as unknown as OrderTypeEnum,
        status: In([OrderStatusEnum.PENDING, OrderStatusEnum.PARTIALLY_COMPLETED]),
      },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });

    let closed = 0;
    for (const order of orders) {
      try {
        await this.walletOrderService.rejectOrder(
          order,
          order.pricePair,
          OrderStatusEnum.CANCELLED,
        );
        closed++;
      } catch (err) {
        this.logger.error(
          `Failed to close order ${order.orderCode} (${order.id}): ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Closed ${closed}/${orders.length} ${poolType} order(s) for pair ${pairId}`,
    );
    return closed;
  }
}
