import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WalletEntity } from '../entities/wallet.entity';
import { TransactionEntity } from '../entities/transaction.entity';
import { MESQAL_TO_GRAM } from '../../common/constants';
import { PricePairEntity } from '../../admin-pair/entity/price.pair.entity';
import { OrderEntity } from '../../order/order.entity';
import { OrderSideEnum } from '../../order/enum/order.side.enum';
import { OrderTypeEnum } from '../../order/enum/order.type.enum';
import { OrderStatusEnum } from '../../order/enum/order.status.enum';
import { TransactionTypeEnum } from '../enum/transaction.type.enum';
import { TransactionStatusEnum } from '../enum/transaction.status.enum';
import { SystemLedgerEntity } from '../../financial/entity/system-ledger.entity';
import { SystemLedgerType } from '../../financial/enum/system-ledger-type.enum';
import { OrderSource } from '../../order-book/interfaces/order-book.types';

@Injectable()
export class WalletOrderService {
  private readonly logger = new Logger(WalletOrderService.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async freezeForOrder(
    order: OrderEntity,
    pricePair: PricePairEntity,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (order.side === OrderSideEnum.BUY) {
        const quoteWallet = await this.getWallet(queryRunner, order.userId, pricePair.quoteSymbol.id);
        // Lock the DISPLAY-priced cost (what the user is charged), not the pure price.
        const unitPrice = Number(order.customerPrice) || Number(order.price) || 0;
        let lockAmount = Number(order.quantity) * unitPrice;

        // QUOTE BUY: commission is charged in the QUOTE asset (IRR) on top.
        if (order.orderType === OrderTypeEnum.QUOTE) {
          lockAmount += Number(order.commission) || 0;
        }

        if (quoteWallet.freeBalance < lockAmount) {
          this.logger.warn(
            `Insufficient ${pricePair.quoteSymbol.slug} balance for order ${order.orderCode}: required ${lockAmount}, available ${quoteWallet.freeBalance}`,
          );
          throw new BadRequestException("INSUFFICIENT_BALANCE");
        }

        // A freeze just holds funds (free → locked) within the user's own
        // wallet — it's not a money movement, so we don't record a transaction
        // for it. The hold is visible via the wallet's locked balance, and the
        // actual spend is recorded once on completion. This also keeps a
        // rejected/cancelled order showing only the positive (+) refund.
        quoteWallet.freeBalance = Number((quoteWallet.freeBalance - lockAmount).toFixed(8));
        quoteWallet.lockedBalance = Number((quoteWallet.lockedBalance + lockAmount).toFixed(8));
        await queryRunner.manager.save(quoteWallet);
      } else {
        const baseWallet = await this.getWallet(queryRunner, order.userId, pricePair.baseSymbol.id);
        const lockAmount = Number(order.quantity);

        if (baseWallet.freeBalance < lockAmount) {
          this.logger.warn(
            `Insufficient ${pricePair.baseSymbol.slug} balance for order ${order.orderCode}: required ${lockAmount}, available ${baseWallet.freeBalance}`,
          );
          // Plain i18n key — the response interceptor translates message.<KEY>.
          throw new BadRequestException("INSUFFICIENT_BALANCE");
        }

        // Hold only (free → locked); not recorded as a transaction. See the BUY
        // branch above.
        baseWallet.freeBalance = Number((baseWallet.freeBalance - lockAmount).toFixed(8));
        baseWallet.lockedBalance = Number((baseWallet.lockedBalance + lockAmount).toFixed(8));
        await queryRunner.manager.save(baseWallet);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Balance locked for order ${order.orderCode}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async confirmOrderExecution(
    order: OrderEntity,
    pricePair: PricePairEntity,
  ): Promise<void> {
    if (
      order.status === OrderStatusEnum.COMPLETED ||
      order.status === OrderStatusEnum.REJECTED ||
      order.status === OrderStatusEnum.CANCELLED
    ) {
      this.logger.warn(
        `Order ${order.orderCode} already in terminal state ${order.status}, skipping confirm`,
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const baseWallet = await this.getWallet(queryRunner, order.userId, pricePair.baseSymbol.id);
      const quoteWallet = await this.getWallet(queryRunner, order.userId, pricePair.quoteSymbol.id);

      // Settlement model:
      //   MARKET / LIMIT (BUY)  → profit always realised in BASE asset (XAU).
      //      User pays the DISPLAY price; that IRR buys more gold at the
      //      provider's (pure) price than the user receives (qty*(1-rate)),
      //      so the platform keeps the difference as XAU profit per provider.
      //   QUOTE (BUY)  → commission charged in QUOTE asset (IRR) on top of
      //      the pure price. User pays extra IRR, receives full qty XAU.
      //   SELL (all types) → user gives full gold, receives netQty*price IRR;
      //      commission qty*rate in XAU.
      const isQuote = order.orderType === OrderTypeEnum.QUOTE;
      const qty = Number(order.quantity); // grams
      const displayPrice = Number(order.price) || 0; // customer price (charged on a BUY)
      const price =
        Number(order.mesghalPrice) > 0 ? Number(order.mesghalPrice) / MESQAL_TO_GRAM : displayPrice; // pure gram price

      if (order.side === OrderSideEnum.BUY) {
        if (isQuote) {
          // QUOTE BUY: commission in IRR (quote), user gets full qty XAU.
          const rate = Number(pricePair.buyCommission) || 0;
          const totalCost = Number((qty * displayPrice).toFixed(8));
          const commissionInQuote = Number(order.commission) || Number((totalCost * rate / 100).toFixed(8));

          quoteWallet.lockedBalance = Number((quoteWallet.lockedBalance - totalCost - commissionInQuote).toFixed(8));
          baseWallet.freeBalance = Number((baseWallet.freeBalance + qty).toFixed(8));

          await queryRunner.manager.save(quoteWallet);
          await queryRunner.manager.save(baseWallet);

          await this.createTransaction(queryRunner, baseWallet, order, {
            transactionType: TransactionTypeEnum.BUY,
            amount: qty,
            price: displayPrice,
            fee: 0,
            description: `Quote buy order ${order.orderCode} executed: received ${qty} ${pricePair.baseSymbol.slug}`,
            metadata: { unit: pricePair.baseSymbol.slug, orderType: 'QUOTE' },
          });

          await this.createTransaction(queryRunner, quoteWallet, order, {
            transactionType: TransactionTypeEnum.ORDER,
            amount: -(totalCost + commissionInQuote),
            price: displayPrice,
            fee: commissionInQuote,
            description: `Quote buy order ${order.orderCode} executed: spent ${totalCost} + commission ${commissionInQuote} ${pricePair.quoteSymbol.slug}`,
            metadata: { commission: commissionInQuote, commissionRate: rate, unit: pricePair.quoteSymbol.slug },
          });

          if (commissionInQuote > 0) {
            await this.recordSystemProfit(queryRunner, {
              symbolId: pricePair.baseSymbol.id,
              type: SystemLedgerType.COMMISSION_BUY,
              amount: commissionInQuote,
              order,
              description: `Quote buy commission for ${order.orderCode} (${rate}%) in ${pricePair.quoteSymbol.slug}`,
            });
          }
        } else {
          // MARKET / LIMIT BUY: profit in XAU (base).
          const rate = Number(pricePair.buyCommission) || 0;
          const totalCost = Number((qty * displayPrice).toFixed(8));
          const netQty = Number((qty * (1 - rate / 100)).toFixed(8));
          const goldFromProvider = price > 0 ? Number((totalCost / price).toFixed(8)) : netQty;
          const profitXau = Number((goldFromProvider - netQty).toFixed(8));

          quoteWallet.lockedBalance = Number((quoteWallet.lockedBalance - totalCost).toFixed(8));
          baseWallet.freeBalance = Number((baseWallet.freeBalance + netQty).toFixed(8));

          await queryRunner.manager.save(quoteWallet);
          await queryRunner.manager.save(baseWallet);

          await this.createTransaction(queryRunner, baseWallet, order, {
            transactionType: TransactionTypeEnum.BUY,
            amount: netQty,
            price: displayPrice,
            fee: profitXau,
            description: `Buy order ${order.orderCode} executed: received ${netQty} ${pricePair.baseSymbol.slug}`,
            metadata: {
              profitXau, commissionRate: rate, displayPrice, providerPrice: price,
              goldFromProvider, unit: pricePair.baseSymbol.slug,
            },
          });

          await this.createTransaction(queryRunner, quoteWallet, order, {
            transactionType: TransactionTypeEnum.ORDER,
            amount: -totalCost,
            price: displayPrice,
            description: `Buy order ${order.orderCode} executed: spent ${totalCost} ${pricePair.quoteSymbol.slug}`,
          });

          if (profitXau > 0) {
            await this.recordSystemProfit(queryRunner, {
              symbolId: pricePair.baseSymbol.id,
              type: SystemLedgerType.COMMISSION_BUY,
              amount: profitXau,
              order,
              description: `Buy profit (spread+commission) for ${order.orderCode} via ${order.metadata?.providerKey ?? "?"}`,
            });
          }
        }
      } else {
        // SELL — commission always in XAU (base asset).
        // User locks qty XAU, receives full qty * price IRR.
        // Platform keeps (qty * rate/100) XAU as commission profit.
        const rate = Number(pricePair.sellCommission) || 0;
        const commission = Number((qty * rate / 100).toFixed(8));
        const totalRevenue = Number((qty * price).toFixed(8));

        baseWallet.lockedBalance = Number((baseWallet.lockedBalance - qty).toFixed(8));
        quoteWallet.freeBalance = Number((quoteWallet.freeBalance + totalRevenue).toFixed(8));

        await queryRunner.manager.save(baseWallet);
        await queryRunner.manager.save(quoteWallet);

        await this.createTransaction(queryRunner, baseWallet, order, {
          transactionType: TransactionTypeEnum.SELL,
          amount: -qty,
          price,
          fee: commission,
          description: `Sell order ${order.orderCode} executed: sold ${qty} ${pricePair.baseSymbol.slug} (commission ${commission} ${pricePair.baseSymbol.slug})`,
          metadata: { commission, commissionRate: rate, unit: pricePair.baseSymbol.slug },
        });

        await this.createTransaction(queryRunner, quoteWallet, order, {
          transactionType: TransactionTypeEnum.ORDER,
          amount: totalRevenue,
          price,
          description: `Sell order ${order.orderCode} executed: received ${totalRevenue} ${pricePair.quoteSymbol.slug}`,
        });

        if (commission > 0) {
          await this.recordSystemProfit(queryRunner, {
            symbolId: pricePair.baseSymbol.id,
            type: SystemLedgerType.COMMISSION_SELL,
            amount: commission,
            order,
            description: `Sell commission for ${order.orderCode} (${rate}%) in ${pricePair.baseSymbol.slug}`,
          });
        }
      }

      order.executedQuantity = qty;
      order.status = 'COMPLETED' as any;
      order.completedAt = new Date();
      order.totalValue = Number((qty * price).toFixed(8));
      order.averagePrice = price;
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      this.logger.log(`Order ${order.orderCode} execution confirmed, wallets updated`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // Unlocks the balance frozen for an order and moves it to a terminal state.
  // Used both when a provider rejects an order (REJECTED) and when the user
  // cancels an open order (CANCELLED).
  async rejectOrder(
    order: OrderEntity,
    pricePair: PricePairEntity,
    finalStatus: OrderStatusEnum = OrderStatusEnum.REJECTED,
  ): Promise<void> {
    if (
      order.status === OrderStatusEnum.COMPLETED ||
      order.status === OrderStatusEnum.REJECTED ||
      order.status === OrderStatusEnum.CANCELLED
    ) {
      this.logger.warn(
        `Order ${order.orderCode} already in terminal state ${order.status}, skipping reject`,
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const isCancel = finalStatus === OrderStatusEnum.CANCELLED;
    const txType = isCancel ? TransactionTypeEnum.ORDER_CANCEL : TransactionTypeEnum.ORDER_REJECTED;
    const verb = isCancel ? 'cancelled' : 'rejected';

    try {
      // Only unlock the REMAINING quantity — the already-executed portion
      // was already settled and its lock released.
      const remainingQty = Number(order.quantity) - Number(order.executedQuantity);

      if (order.side === OrderSideEnum.BUY) {
        const quoteWallet = await this.getWallet(queryRunner, order.userId, pricePair.quoteSymbol.id);
        let lockedAmount = Math.max(0, remainingQty) * (Number(order.price) || 0);

        // QUOTE BUY: commission was also frozen in the quote wallet.
        if (order.orderType === OrderTypeEnum.QUOTE) {
          lockedAmount += Number(order.commission) || 0;
        }

        quoteWallet.lockedBalance = Number((quoteWallet.lockedBalance - lockedAmount).toFixed(8));
        quoteWallet.freeBalance = Number((quoteWallet.freeBalance + lockedAmount).toFixed(8));
        await queryRunner.manager.save(quoteWallet);

        await this.createTransaction(queryRunner, quoteWallet, order, {
          transactionType: txType,
          amount: lockedAmount, // positive: funds returned to free balance
          description: `Buy order ${order.orderCode} ${verb}: unlocked ${lockedAmount} ${pricePair.quoteSymbol.slug}`,
        });
      } else {
        const baseWallet = await this.getWallet(queryRunner, order.userId, pricePair.baseSymbol.id);
        const lockedAmount = Math.max(0, remainingQty);

        baseWallet.lockedBalance = Number((baseWallet.lockedBalance - lockedAmount).toFixed(8));
        baseWallet.freeBalance = Number((baseWallet.freeBalance + lockedAmount).toFixed(8));
        await queryRunner.manager.save(baseWallet);

        await this.createTransaction(queryRunner, baseWallet, order, {
          transactionType: txType,
          amount: lockedAmount, // positive: funds returned to free balance
          description: `Sell order ${order.orderCode} ${verb}: unlocked ${lockedAmount} ${pricePair.baseSymbol.slug}`,
        });
      }

      order.status = finalStatus;
      if (finalStatus === OrderStatusEnum.CANCELLED) order.cancelledAt = new Date();
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      this.logger.log(`Order ${order.orderCode} ${finalStatus.toLowerCase()}, balance unlocked`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Settle one matched leg from the order book for a LIMIT order.
   * Handles both CUSTOMER (P2P) and PROVIDER matches.
   */
  async settleLimitMatch(
    takerOrder: OrderEntity,
    matchSize: number,
    takerPrice: number,
    makerPrice: number,
    makerSource: string,
    makerOrderId: string | null,
    pricePair: PricePairEntity,
  ): Promise<void> {
    const isBuy = takerOrder.side === OrderSideEnum.BUY;
    const buyComm = Number(pricePair.buyCommission) || 0;
    const sellComm = Number(pricePair.sellCommission) || 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ── Taker side ────────────────────────────────────────────────
      const takerQuoteWallet = await this.getWallet(queryRunner, takerOrder.userId, pricePair.quoteSymbol.id);
      const takerBaseWallet = await this.getWallet(queryRunner, takerOrder.userId, pricePair.baseSymbol.id);

      const cost = Number((matchSize * takerPrice).toFixed(8));
      const netBase = isBuy
        ? Number((matchSize * (1 - buyComm / 100)).toFixed(8))
        : matchSize;
      // totalRevenue is the full IRR amount a SELL taker receives (commission in XAU)
      const totalRevenue = Number((matchSize * takerPrice).toFixed(8));

      if (isBuy) {
        // BUY taker: locked quote → consumed, free base ← net gold
        if (takerQuoteWallet.lockedBalance < cost) {
          throw new BadRequestException('INSUFFICIENT_LOCKED_BALANCE');
        }
        takerQuoteWallet.lockedBalance = Number((takerQuoteWallet.lockedBalance - cost).toFixed(8));
        takerBaseWallet.freeBalance = Number((takerBaseWallet.freeBalance + netBase).toFixed(8));
      } else {
        // SELL taker: locked base → consumed, free quote ← full revenue
        // Commission is in XAU (base) – recorded as system profit below.
        if (takerBaseWallet.lockedBalance < matchSize) {
          throw new BadRequestException('INSUFFICIENT_LOCKED_BALANCE');
        }
        takerBaseWallet.lockedBalance = Number((takerBaseWallet.lockedBalance - matchSize).toFixed(8));
        takerQuoteWallet.freeBalance = Number((takerQuoteWallet.freeBalance + totalRevenue).toFixed(8));
      }

      await queryRunner.manager.save(takerQuoteWallet);
      await queryRunner.manager.save(takerBaseWallet);

      await this.createTransaction(queryRunner, isBuy ? takerQuoteWallet : takerBaseWallet, takerOrder, {
        transactionType: isBuy ? TransactionTypeEnum.ORDER : TransactionTypeEnum.SELL,
        amount: isBuy ? -cost : -matchSize,
        price: takerPrice,
        fee: 0,
        description: `Limit ${isBuy ? 'buy' : 'sell'} matched: ${isBuy ? cost : matchSize} consumed`,
      });

      const takerReceived = isBuy ? netBase : totalRevenue;
      await this.createTransaction(queryRunner, isBuy ? takerBaseWallet : takerQuoteWallet, takerOrder, {
        transactionType: isBuy ? TransactionTypeEnum.BUY : TransactionTypeEnum.ORDER,
        amount: takerReceived,
        price: takerPrice,
        fee: isBuy ? Number((matchSize * buyComm / 100).toFixed(8)) : Number((matchSize * sellComm / 100).toFixed(8)),
        description: `Limit ${isBuy ? 'buy' : 'sell'} matched: received ${takerReceived} ${isBuy ? pricePair.baseSymbol.slug : pricePair.quoteSymbol.slug}`,
      });

      // ── Maker side (P2P only) ─────────────────────────────────────
      if (makerSource === OrderSource.CUSTOMER && makerOrderId) {
        const makerOrder = await queryRunner.manager.findOne(OrderEntity, {
          where: { id: makerOrderId },
        });
        if (!makerOrder) {
          throw new Error(`Maker order ${makerOrderId} not found`);
        }

        const isMakerBuy = makerOrder.side === OrderSideEnum.BUY;
        const makerQuoteWallet = await this.getWallet(queryRunner, makerOrder.userId, pricePair.quoteSymbol.id);
        const makerBaseWallet = await this.getWallet(queryRunner, makerOrder.userId, pricePair.baseSymbol.id);

        if (isMakerBuy) {
          // Maker BUY (taker was SELL): maker locked quote → consumed
          // Commission taken in XAU: maker receives less gold
          const makerCost = Number((matchSize * makerPrice).toFixed(8));
          const makerNetBase = Number((matchSize * (1 - buyComm / 100)).toFixed(8));
          if (makerQuoteWallet.lockedBalance < makerCost) throw new BadRequestException('INSUFFICIENT_LOCKED_BALANCE');
          makerQuoteWallet.lockedBalance = Number((makerQuoteWallet.lockedBalance - makerCost).toFixed(8));
          makerBaseWallet.freeBalance = Number((makerBaseWallet.freeBalance + makerNetBase).toFixed(8));
          await queryRunner.manager.save(makerQuoteWallet);
          await queryRunner.manager.save(makerBaseWallet);

          await this.createTransaction(queryRunner, makerQuoteWallet, makerOrder, {
            transactionType: TransactionTypeEnum.ORDER,
            amount: -makerCost,
            price: makerPrice,
            fee: 0,
            description: `P2P match buy: spent ${makerCost} ${pricePair.quoteSymbol.slug}`,
          });
          await this.createTransaction(queryRunner, makerBaseWallet, makerOrder, {
            transactionType: TransactionTypeEnum.BUY,
            amount: makerNetBase,
            price: makerPrice,
            fee: Number((matchSize * buyComm / 100).toFixed(8)),
            description: `P2P match buy: received ${makerNetBase} ${pricePair.baseSymbol.slug}`,
          });
        } else {
          // Maker SELL (taker was BUY): maker locked base → consumed
          // Commission is in XAU (base) — deducted from quantity, not revenue.
          if (makerBaseWallet.lockedBalance < matchSize) throw new BadRequestException('INSUFFICIENT_LOCKED_BALANCE');
          const makerTotalRevenue = Number((matchSize * makerPrice).toFixed(8));
          makerBaseWallet.lockedBalance = Number((makerBaseWallet.lockedBalance - matchSize).toFixed(8));
          makerQuoteWallet.freeBalance = Number((makerQuoteWallet.freeBalance + makerTotalRevenue).toFixed(8));
          await queryRunner.manager.save(makerBaseWallet);
          await queryRunner.manager.save(makerQuoteWallet);

          await this.createTransaction(queryRunner, makerBaseWallet, makerOrder, {
            transactionType: TransactionTypeEnum.SELL,
            amount: -matchSize,
            price: makerPrice,
            fee: Number((matchSize * sellComm / 100).toFixed(8)),
            description: `P2P match sell: spent ${matchSize} ${pricePair.baseSymbol.slug}`,
          });
          await this.createTransaction(queryRunner, makerQuoteWallet, makerOrder, {
            transactionType: TransactionTypeEnum.ORDER,
            amount: makerTotalRevenue,
            price: makerPrice,
            fee: 0,
            description: `P2P match sell: received ${makerTotalRevenue} ${pricePair.quoteSymbol.slug}`,
          });
        }

        // Update maker order execution
        const newExecuted = Number(makerOrder.executedQuantity) + matchSize;
        makerOrder.executedQuantity = newExecuted;
        makerOrder.averagePrice = makerPrice;
        makerOrder.totalValue = Number((newExecuted * makerPrice).toFixed(8));
        if (newExecuted >= Number(makerOrder.quantity)) {
          makerOrder.status = OrderStatusEnum.COMPLETED;
          makerOrder.completedAt = new Date();
        } else if (newExecuted > 0) {
          makerOrder.status = OrderStatusEnum.PARTIALLY_COMPLETED;
        }
        await queryRunner.manager.save(makerOrder);
      }

      // ── System profit ─────────────────────────────────────────────
      // Spread profit = difference between taker and maker price
      const spreadProfit = Number((matchSize * (isBuy ? takerPrice - makerPrice : makerPrice - takerPrice)).toFixed(4));
      if (spreadProfit > 0) {
        await this.recordSystemProfit(queryRunner, {
          symbolId: pricePair.quoteSymbol.id,
          type: SystemLedgerType.COMMISSION_BUY,
          amount: spreadProfit,
          order: takerOrder,
          description: `Limit match spread for ${takerOrder.orderCode}: ${spreadProfit} ${pricePair.quoteSymbol.slug}`,
        });
      }

      // Taker commission in XAU
      const takerCommission = isBuy
        ? Number((matchSize * buyComm / 100).toFixed(8))
        : Number((matchSize * sellComm / 100).toFixed(8));
      if (takerCommission > 0) {
        await this.recordSystemProfit(queryRunner, {
          symbolId: pricePair.baseSymbol.id,
          type: isBuy ? SystemLedgerType.COMMISSION_BUY : SystemLedgerType.COMMISSION_SELL,
          amount: takerCommission,
          order: takerOrder,
          description: `Taker commission for ${takerOrder.orderCode}: ${takerCommission} ${pricePair.baseSymbol.slug}`,
        });
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Limit match settled: ${matchSize}g @ ${takerPrice} for ${takerOrder.orderCode}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async getWallet(
    queryRunner: any,
    userId: string,
    symbolId: string,
  ): Promise<WalletEntity> {
    let wallet = await queryRunner.manager.findOne(WalletEntity, {
      where: { userId, symbolId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        freeBalance: 0,
        lockedBalance: 0,
        status: 'ACTIVE',
      });
      wallet = await queryRunner.manager.save(wallet);
    }

    // Postgres returns numeric/decimal columns as strings; coerce so arithmetic
    // (especially `+`, which would otherwise concatenate) works correctly.
    wallet.freeBalance = Number(wallet.freeBalance) || 0;
    wallet.lockedBalance = Number(wallet.lockedBalance) || 0;
    wallet.frozenFreeBalance = Number(wallet.frozenFreeBalance) || 0;
    wallet.frozenLockedBalance = Number(wallet.frozenLockedBalance) || 0;

    return wallet;
  }

  // Credits the platform's system ledger with profit (commission) from a trade,
  // within the same transaction as the wallet movements.
  private async recordSystemProfit(
    queryRunner: any,
    params: {
      symbolId: string;
      type: SystemLedgerType;
      amount: number;
      order: OrderEntity;
      description: string;
    },
  ): Promise<void> {
    await queryRunner.manager.save(SystemLedgerEntity, {
      symbolId: params.symbolId,
      type: params.type,
      amount: params.amount,
      orderId: params.order.id,
      userId: params.order.userId,
      providerKey: params.order.metadata?.providerKey ?? null,
      description: params.description,
    });
  }

  private async createTransaction(
    queryRunner: any,
    wallet: WalletEntity,
    order: OrderEntity,
    params: {
      transactionType: TransactionTypeEnum;
      amount: number;
      price?: number;
      fee?: number;
      description: string;
      metadata?: any;
    },
  ): Promise<TransactionEntity> {
    const tx = this.transactionRepo.create({
      walletId: wallet.id,
      wallet,
      orderId: order.id,
      order,
      transactionId: `TXN-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
      transactionType: params.transactionType,
      status: TransactionStatusEnum.COMPLETED,
      amount: params.amount,
      fee: params.fee || 0,
      price: params.price || 0,
      description: params.description,
      metadata: {
        ...params.metadata,
        orderCode: order.orderCode,
        timestamp: new Date().toISOString(),
      },
      completedAt: new Date(),
    });
    return queryRunner.manager.save(tx);
  }
}
