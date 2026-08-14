import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Repository, DataSource } from "typeorm";
import { OrderEntity } from "./order.entity";
import { OrderTypeEnum } from "./enum/order.type.enum";
import { OrderStatusEnum } from "./enum/order.status.enum";
import { OrderSideEnum } from "./enum/order.side.enum";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SystemLedgerType } from "../financial/enum/system-ledger-type.enum";
import * as crypto from "crypto";
import { OrderEvents } from "../shared/constants/events.constants";

interface MatchResult {
  message: string;
  showAlert: boolean;
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async requestMatch(orderId: string, requesterUserId: string): Promise<MatchResult> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });

    if (!order) {
      return { message: "❌ سفارش یافت نشد", showAlert: true };
    }

    if (order.status !== OrderStatusEnum.PENDING) {
      return { message: "❌ این سفارش قبلاً تکمیل یا لغو شده است", showAlert: true };
    }

    if (order.userId === requesterUserId) {
      return { message: "❌ نمی‌توانید سفارش خود را تطبیق دهید", showAlert: true };
    }

    const pair = order.pricePair;
    if (!pair) {
      return { message: "❌ اطلاعات جفت‌ارز یافت نشد", showAlert: true };
    }

    const qty = Number(order.quantity);
    const price = Number(order.price) || 0;
    if (qty <= 0 || price <= 0) {
      return { message: "❌ قیمت یا مقدار سفارش نامعتبر است", showAlert: true };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const buyComm = Number(pair.buyCommission) || 0;
      const sellComm = Number(pair.sellCommission) || 0;

      if (order.side === OrderSideEnum.BUY) {
        // Owner BUY (has IRR locked) ↔ Requester SELL (needs XAU locked)
        const requesterXauWallet = await this.getWallet(queryRunner, requesterUserId, pair.baseSymbol.id);
        const ownerXauWallet = await this.getWallet(queryRunner, order.userId, pair.baseSymbol.id);
        const requesterIrWallet = await this.getWallet(queryRunner, requesterUserId, pair.quoteSymbol.id);
        const ownerIrWallet = await this.getWallet(queryRunner, order.userId, pair.quoteSymbol.id);

        if (requesterXauWallet.freeBalance < qty) {
          await queryRunner.rollbackTransaction();
          return { message: `❌ موجودی ${pair.baseSymbol?.slug || "XAU"} کافی نیست`, showAlert: true };
        }

        // Freeze requester's XAU
        requesterXauWallet.freeBalance = Number((requesterXauWallet.freeBalance - qty).toFixed(8));
        requesterXauWallet.lockedBalance = Number((requesterXauWallet.lockedBalance + qty).toFixed(8));

        // Check owner has enough locked IRR
        const totalCost = Number((qty * price).toFixed(8));
        if (ownerIrWallet.lockedBalance < totalCost) {
          await queryRunner.rollbackTransaction();
          return { message: `❌ موجودی مسدود شده ${pair.quoteSymbol?.slug || "IRR"} طرف مقابل کافی نیست`, showAlert: true };
        }

        // Execute: owner's locked IRR → consumed, owner gets XAU net of commission
        const ownerNetXau = Number((qty * (1 - buyComm / 100)).toFixed(8));
        ownerIrWallet.lockedBalance = Number((ownerIrWallet.lockedBalance - totalCost).toFixed(8));
        ownerXauWallet.freeBalance = Number((ownerXauWallet.freeBalance + ownerNetXau).toFixed(8));

        // Execute: requester's locked XAU → consumed, requester gets full IRR
        requesterXauWallet.lockedBalance = Number((requesterXauWallet.lockedBalance - qty).toFixed(8));
        requesterIrWallet.freeBalance = Number((requesterIrWallet.freeBalance + totalCost).toFixed(8));

        await queryRunner.manager.save([requesterXauWallet, ownerXauWallet, requesterIrWallet, ownerIrWallet]);

        // Record transactions
        await this.createTransaction(queryRunner, ownerIrWallet, order, {
          transactionType: TransactionTypeEnum.ORDER,
          amount: -totalCost,
          price,
          description: `P2P match buy: spent ${totalCost} ${pair.quoteSymbol.slug}`,
        });
        await this.createTransaction(queryRunner, ownerXauWallet, order, {
          transactionType: TransactionTypeEnum.BUY,
          amount: ownerNetXau,
          price,
          fee: Number((qty * buyComm / 100).toFixed(8)),
          description: `P2P match buy: received ${ownerNetXau} ${pair.baseSymbol.slug}`,
        });

        // Requester commission in XAU
        const requesterSellerComm = Number((qty * sellComm / 100).toFixed(8));
        if (requesterSellerComm > 0) {
          await this.recordSystemProfit(queryRunner, {
            symbolId: pair.baseSymbol.id,
            type: SystemLedgerType.COMMISSION_SELL,
            amount: requesterSellerComm,
            orderId: order.id,
            userId: requesterUserId,
            description: `P2P match sell commission for ${order.orderCode}: ${requesterSellerComm} ${pair.baseSymbol.slug}`,
          });
        }
        // Owner commission in XAU
        const ownerBuyerComm = Number((qty * buyComm / 100).toFixed(8));
        if (ownerBuyerComm > 0) {
          await this.recordSystemProfit(queryRunner, {
            symbolId: pair.baseSymbol.id,
            type: SystemLedgerType.COMMISSION_BUY,
            amount: ownerBuyerComm,
            orderId: order.id,
            userId: order.userId,
            description: `P2P match buy commission for ${order.orderCode}: ${ownerBuyerComm} ${pair.baseSymbol.slug}`,
          });
        }
      } else {
        // Owner SELL (has XAU locked) ↔ Requester BUY (needs IRR locked)
        const requesterIrWallet = await this.getWallet(queryRunner, requesterUserId, pair.quoteSymbol.id);
        const ownerIrWallet = await this.getWallet(queryRunner, order.userId, pair.quoteSymbol.id);
        const requesterXauWallet = await this.getWallet(queryRunner, requesterUserId, pair.baseSymbol.id);
        const ownerXauWallet = await this.getWallet(queryRunner, order.userId, pair.baseSymbol.id);

        const totalCost = Number((qty * price).toFixed(8));

        if (requesterIrWallet.freeBalance < totalCost) {
          await queryRunner.rollbackTransaction();
          return { message: `❌ موجودی ${pair.quoteSymbol?.slug || "IRR"} کافی نیست`, showAlert: true };
        }

        // Freeze requester's IRR
        requesterIrWallet.freeBalance = Number((requesterIrWallet.freeBalance - totalCost).toFixed(8));
        requesterIrWallet.lockedBalance = Number((requesterIrWallet.lockedBalance + totalCost).toFixed(8));

        // Check owner has enough locked XAU
        if (ownerXauWallet.lockedBalance < qty) {
          await queryRunner.rollbackTransaction();
          return { message: `❌ موجودی مسدود شده ${pair.baseSymbol?.slug || "XAU"} طرف مقابل کافی نیست`, showAlert: true };
        }

        // Execute: owner's locked XAU → consumed, owner gets full IRR
        ownerXauWallet.lockedBalance = Number((ownerXauWallet.lockedBalance - qty).toFixed(8));
        ownerIrWallet.freeBalance = Number((ownerIrWallet.freeBalance + totalCost).toFixed(8));

        // Execute: requester's locked IRR → consumed, requester gets XAU net of commission
        const requesterNetXau = Number((qty * (1 - sellComm / 100)).toFixed(8));
        requesterIrWallet.lockedBalance = Number((requesterIrWallet.lockedBalance - totalCost).toFixed(8));
        requesterXauWallet.freeBalance = Number((requesterXauWallet.freeBalance + requesterNetXau).toFixed(8));

        await queryRunner.manager.save([requesterIrWallet, ownerIrWallet, requesterXauWallet, ownerXauWallet]);

        // Record transactions
        await this.createTransaction(queryRunner, ownerXauWallet, order, {
          transactionType: TransactionTypeEnum.SELL,
          amount: -qty,
          price,
          fee: Number((qty * sellComm / 100).toFixed(8)),
          description: `P2P match sell: spent ${qty} ${pair.baseSymbol.slug}`,
        });
        await this.createTransaction(queryRunner, ownerIrWallet, order, {
          transactionType: TransactionTypeEnum.ORDER,
          amount: totalCost,
          price,
          description: `P2P match sell: received ${totalCost} ${pair.quoteSymbol.slug}`,
        });

        // Requester commission in XAU
        const requesterBuyerComm = Number((qty * buyComm / 100).toFixed(8));
        if (requesterBuyerComm > 0) {
          await this.recordSystemProfit(queryRunner, {
            symbolId: pair.baseSymbol.id,
            type: SystemLedgerType.COMMISSION_BUY,
            amount: requesterBuyerComm,
            orderId: order.id,
            userId: requesterUserId,
            description: `P2P match buy commission for ${order.orderCode}: ${requesterBuyerComm} ${pair.baseSymbol.slug}`,
          });
        }
        // Owner commission in XAU
        const ownerSellComm = Number((qty * sellComm / 100).toFixed(8));
        if (ownerSellComm > 0) {
          await this.recordSystemProfit(queryRunner, {
            symbolId: pair.baseSymbol.id,
            type: SystemLedgerType.COMMISSION_SELL,
            amount: ownerSellComm,
            orderId: order.id,
            userId: order.userId,
            description: `P2P match sell commission for ${order.orderCode}: ${ownerSellComm} ${pair.baseSymbol.slug}`,
          });
        }
      }

      // Update original order as completed
      order.executedQuantity = qty;
      order.totalValue = Number((qty * price).toFixed(8));
      order.averagePrice = price;
      order.status = OrderStatusEnum.COMPLETED;
      order.completedAt = new Date();
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();

      this.logger.log(`P2P match complete: order ${order.orderCode} matched by user ${requesterUserId}`);
      this.eventEmitter.emit(OrderEvents.MATCHED, {
        userId: order.userId,
        orderId: order.id,
        symbol: pair.baseSymbol?.slug,
        quantity: qty,
        price,
      });
      if (requesterUserId !== order.userId) {
        this.eventEmitter.emit(OrderEvents.MATCHED, {
          userId: requesterUserId,
          orderId: order.id,
          symbol: pair.baseSymbol?.slug,
          quantity: qty,
          price,
        });
      }
      return { message: "✅ تطابق با موفقیت انجام شد", showAlert: false };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`P2P match failed: ${(err as Error).message}`);
      return { message: `❌ خطا در تطابق: ${(err as Error).message}`, showAlert: true };
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
      lock: { mode: "pessimistic_write" },
    });
    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        freeBalance: 0,
        lockedBalance: 0,
        status: "ACTIVE",
      });
      wallet = await queryRunner.manager.save(wallet);
    }
    wallet.freeBalance = Number(wallet.freeBalance) || 0;
    wallet.lockedBalance = Number(wallet.lockedBalance) || 0;
    return wallet;
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
    },
  ): Promise<TransactionEntity> {
    const tx = this.transactionRepo.create({
      walletId: wallet.id,
      wallet,
      orderId: order.id,
      order,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: params.transactionType,
      status: TransactionStatusEnum.COMPLETED,
      amount: params.amount,
      fee: params.fee || 0,
      price: params.price || 0,
      description: params.description,
      metadata: { orderCode: order.orderCode, timestamp: new Date().toISOString() },
      completedAt: new Date(),
    });
    return queryRunner.manager.save(tx);
  }

  private async recordSystemProfit(
    queryRunner: any,
    params: {
      symbolId: string;
      type: SystemLedgerType;
      amount: number;
      orderId: string;
      userId: string;
      description: string;
    },
  ): Promise<void> {
    await queryRunner.manager.save(SystemLedgerEntity, {
      symbolId: params.symbolId,
      type: params.type,
      amount: params.amount,
      orderId: params.orderId,
      userId: params.userId,
      description: params.description,
    });
  }
}
