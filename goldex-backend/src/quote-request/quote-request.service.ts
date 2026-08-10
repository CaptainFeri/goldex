import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, DataSource } from "typeorm";
import { QuoteRequestEntity, QuoteRequestStatus } from "./quote-request.entity";
import { OrderSideEnum } from "../order/enum/order.side.enum";
import { UserTelegramService } from "../user-telegram/user-telegram.service";
import { TelegramNotifierService } from "../telegram-notifier/telegram-notifier.service";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SystemLedgerType } from "../financial/enum/system-ledger-type.enum";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import * as crypto from "crypto";

interface CreateQuoteRequestResult {
  request: QuoteRequestEntity;
  matchAlert?: boolean;
  matched?: boolean;
  matchedRequestId?: string | null;
}

@Injectable()
export class QuoteRequestService {
  private readonly logger = new Logger(QuoteRequestService.name);

  constructor(
    @InjectRepository(QuoteRequestEntity)
    private readonly repo: Repository<QuoteRequestEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    private readonly dataSource: DataSource,
    private readonly userTelegram: UserTelegramService,
    private readonly notifier: TelegramNotifierService,
  ) {}

  /**
   * Create a request in the Custom (Telegram) market, then immediately compare
   * it against the other pending requests. A compatible counterpart with the
   * same quantity and a known price is matched right away (customer-to-customer);
   * otherwise the best opportunity is surfaced as a match alert.
   */
  async create(
    userId: string,
    side: OrderSideEnum,
    pricePairId: string,
    quantity: number,
    price?: number,
    notes?: string,
  ): Promise<CreateQuoteRequestResult> {
    const pair = await this.pairRepo.findOne({
      where: { id: pricePairId },
      relations: { baseSymbol: true, quoteSymbol: true },
    });
    if (!pair) throw new Error("جفت‌ارز یافت نشد");

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock balance with pessimistic lock inside the transaction
      await this.lockBalance(queryRunner, userId, side, pair, quantity, price);

      // Save as PENDING
      const entity = this.repo.create({ userId, side, pricePairId, quantity, price, notes, status: QuoteRequestStatus.PENDING });
      const saved = await queryRunner.manager.save(entity);

      await queryRunner.commitTransaction();

      // Compare new request against pending ones (outside the txn — the match
      // itself runs in its own transaction).
      const oppositeSide = side === OrderSideEnum.BUY ? OrderSideEnum.SELL : OrderSideEnum.BUY;
      const candidate = await this.repo.findOne({
        where: { side: oppositeSide, pricePairId, status: QuoteRequestStatus.PENDING, userId: Not(userId) },
        relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
        order: { createAt: "ASC" },
      });

      if (candidate && this.isCompatible(side, quantity, price, candidate.side, Number(candidate.quantity), Number(candidate.price))) {
        // Clean full match (equal quantity, both requests priced) → execute the
        // P2P settlement right away so the custom pool behaves like a real market.
        const newPrice = Number(price);
        const candQty = Number(candidate.quantity);
        const candPrice = Number(candidate.price);
        if (newPrice > 0 && candPrice > 0 && candQty === Number(quantity)) {
          const fresh = await this.repo.findOne({
            where: { id: saved.id },
            relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
          });
          await this.settleMatchPair(fresh || saved, candidate, userId);
          return { request: saved, matchAlert: true, matched: true, matchedRequestId: candidate.id };
        }

        await this.alertMatchOpportunity(saved, candidate);
        return { request: saved, matchAlert: true };
      }

      return { request: saved };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async match(requestId: string, matcherUserId: string): Promise<{ request: QuoteRequestEntity; matchedBuyOrderId: string | null }> {
    const request = await this.repo.findOne({
      where: { id: requestId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!request) throw new Error("درخواست یافت نشد");
    if (request.status !== QuoteRequestStatus.PENDING) throw new Error("این درخواست دیگر فعال نیست");
    if (request.side !== OrderSideEnum.SELL) throw new Error("فقط درخواست‌های فروش قابل تطبیق مستقیم هستند");

    const pair = request.pricePair;
    const quantity = Number(request.quantity);
    const price = Number(request.price);
    if (!price || quantity * price <= 0) {
      throw new Error("قیمت سفارش نامعتبر است");
    }

    let buyerOrder: QuoteRequestEntity | null = null;

    if (request.userId === matcherUserId) {
      // Seller is approving the match — find the matching BUY order
      buyerOrder = await this.repo.findOne({
        where: {
          pricePairId: request.pricePairId,
          side: OrderSideEnum.BUY,
          status: QuoteRequestStatus.PENDING,
          userId: Not(matcherUserId),
        },
        order: { createAt: "ASC" },
      });
      if (!buyerOrder) {
        throw new Error("هیچ سفارش خریدی برای تطبیق یافت نشد");
      }
    }

    await this.settleMatchPair(request, buyerOrder, matcherUserId);

    return { request, matchedBuyOrderId: buyerOrder?.id || null };
  }

  /**
   * Settle a matched customer pair in the Custom market inside one transaction:
   * SELL (XAU locked) → BUY (IRR locked/free), commissions taken in-kind,
   * both requests marked MATCHED.
   */
  private async settleMatchPair(
    sellerRequest: QuoteRequestEntity,
    buyerRequest: QuoteRequestEntity | null,
    buyerUserId: string,
  ): Promise<void> {
    if (sellerRequest.side !== OrderSideEnum.SELL && buyerRequest && buyerRequest.side !== OrderSideEnum.SELL) {
      throw new Error("درخواست فروش برای تطبیق یافت نشد");
    }

    // Normalise: `seller` is always the SELL request.
    const seller =
      sellerRequest.side === OrderSideEnum.SELL ? sellerRequest : buyerRequest;
    const buyer =
      sellerRequest.side === OrderSideEnum.BUY ? sellerRequest : buyerRequest;
    const matcherUserId =
      sellerRequest.side === OrderSideEnum.SELL ? buyerUserId : sellerRequest.userId;

    const pair = seller.pricePair;
    const quantity = Number(seller.quantity);
    const price = Number(seller.price);
    const totalValue = quantity * price;

    if (!pair || !price || totalValue <= 0) {
      throw new Error("قیمت سفارش نامعتبر است");
    }

    const sellerId = seller.userId;
    const buyerId = buyer ? buyer.userId : matcherUserId;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get wallets with pessimistic lock (prevents race conditions)
      const sellerXauWallet = await this.getWallet(queryRunner, sellerId, pair.baseSymbol.id);
      const buyerXauWallet = await this.getWallet(queryRunner, buyerId, pair.baseSymbol.id);
      const sellerIrWallet = await this.getWallet(queryRunner, sellerId, pair.quoteSymbol.id);
      const buyerIrWallet = await this.getWallet(queryRunner, buyerId, pair.quoteSymbol.id);

      // Validate seller has enough locked XAU
      if (sellerXauWallet.lockedBalance < quantity) {
        throw new Error(`موجودی مسدود شده ${pair.baseSymbol.slug} فروشنده کافی نیست`);
      }

      // Buyer's IRR: either already locked (from a BUY request) or taken from free balance
      const buyerIrrAlreadyLocked = buyerIrWallet.lockedBalance >= totalValue;
      if (!buyerIrrAlreadyLocked && buyerIrWallet.freeBalance < totalValue) {
        throw new Error(`موجودی ${pair.quoteSymbol.slug} خریدار کافی نیست (نیاز: ${totalValue.toLocaleString()})`);
      }

      // ── Commission calculation ──
      const sellCommRate = Number(pair.sellCommission) || 0;
      const buyCommRate = Number(pair.buyCommission) || 0;
      // Seller pays commission in XAU (base asset)
      const sellCommission = Number((quantity * sellCommRate / 100).toFixed(8));
      // Buyer pays commission in IRR (quote asset)
      const buyCommission = Number((totalValue * buyCommRate / 100).toFixed(8));
      const netXau = Number((quantity - sellCommission).toFixed(8));
      const netIrr = Number((totalValue - buyCommission).toFixed(8));

      // ── XAU transfer: seller → buyer (minus sell commission) ──
      sellerXauWallet.lockedBalance = Number((sellerXauWallet.lockedBalance - quantity).toFixed(8));
      buyerXauWallet.freeBalance = Number((buyerXauWallet.freeBalance + netXau).toFixed(8));

      // ── IRR transfer: buyer → seller (minus buy commission) ──
      if (buyerIrrAlreadyLocked) {
        buyerIrWallet.lockedBalance = Number((buyerIrWallet.lockedBalance - totalValue).toFixed(8));
      } else {
        buyerIrWallet.freeBalance = Number((buyerIrWallet.freeBalance - totalValue).toFixed(8));
      }
      sellerIrWallet.freeBalance = Number((sellerIrWallet.freeBalance + netIrr).toFixed(8));

      // Save wallet changes
      await queryRunner.manager.save(sellerXauWallet);
      await queryRunner.manager.save(buyerXauWallet);
      await queryRunner.manager.save(buyerIrWallet);
      await queryRunner.manager.save(sellerIrWallet);

      // ── Record transactions ──
      // Seller: XAU debited
      await this.createTransaction(queryRunner, sellerXauWallet, {
        transactionType: TransactionTypeEnum.SELL,
        amount: -quantity,
        price,
        fee: sellCommission,
        description: `P2P match: sold ${quantity} ${pair.baseSymbol.slug} (commission ${sellCommission})`,
        metadata: { commission: sellCommission, commissionRate: sellCommRate, unit: pair.baseSymbol.slug },
      });
      // Seller: IRR credited (net of buyer's commission)
      await this.createTransaction(queryRunner, sellerIrWallet, {
        transactionType: TransactionTypeEnum.ORDER,
        amount: netIrr,
        price,
        description: `P2P match: received ${netIrr} ${pair.quoteSymbol.slug} from buyer`,
      });
      // Buyer: XAU credited (net of seller's commission)
      await this.createTransaction(queryRunner, buyerXauWallet, {
        transactionType: TransactionTypeEnum.BUY,
        amount: netXau,
        price,
        description: `P2P match: received ${netXau} ${pair.baseSymbol.slug} from seller`,
      });
      // Buyer: IRR debited
      await this.createTransaction(queryRunner, buyerIrWallet, {
        transactionType: TransactionTypeEnum.ORDER,
        amount: -totalValue,
        price,
        fee: buyCommission,
        description: `P2P match: spent ${totalValue} ${pair.quoteSymbol.slug} (commission ${buyCommission})`,
        metadata: { commission: buyCommission, commissionRate: buyCommRate, unit: pair.quoteSymbol.slug },
      });

      // ── Record system profit (commissions) ──
      if (sellCommission > 0) {
        await this.recordSystemProfit(queryRunner, {
          symbolId: pair.baseSymbol.id,
          type: SystemLedgerType.COMMISSION_SELL,
          amount: sellCommission,
          requestId: seller.id,
          userId: sellerId,
          description: `P2P sell commission (${sellCommRate}%) in ${pair.baseSymbol.slug}`,
        });
      }
      if (buyCommission > 0) {
        await this.recordSystemProfit(queryRunner, {
          symbolId: pair.quoteSymbol.id,
          type: SystemLedgerType.COMMISSION_BUY,
          amount: buyCommission,
          requestId: seller.id,
          userId: buyerId,
          description: `P2P buy commission (${buyCommRate}%) in ${pair.quoteSymbol.slug}`,
        });
      }

      // Mark SELL request as matched
      seller.status = QuoteRequestStatus.MATCHED;
      seller.matchedUserId = buyerId;
      seller.matchedAt = new Date();
      await queryRunner.manager.save(seller);

      // Mark buyer's request as matched (if it exists)
      if (buyer) {
        const lockedBuyer = await queryRunner.manager.findOne(QuoteRequestEntity, {
          where: { id: buyer.id },
          lock: { mode: "pessimistic_write" },
        });
        if (lockedBuyer && lockedBuyer.status === QuoteRequestStatus.PENDING) {
          lockedBuyer.status = QuoteRequestStatus.MATCHED;
          lockedBuyer.matchedUserId = sellerId;
          lockedBuyer.matchedAt = new Date();
          await queryRunner.manager.save(lockedBuyer);
        }
      }

      await queryRunner.commitTransaction();
      this.logger.log(`P2P match complete: ${quantity} ${pair.baseSymbol.slug} @ ${price}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`P2P match failed: ${(err as Error).message}`);
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Channel message update is handled by goldex-telegram-bot.
    await this.notifyMatchedUsers(seller, buyerId);
  }

  async findMyRequests(userId: string): Promise<QuoteRequestEntity[]> {
    return this.repo.find({
      where: { userId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
      order: { createAt: "DESC" },
    });
  }

  async cancel(requestId: string, userId: string): Promise<void> {
    const request = await this.repo.findOne({
      where: { id: requestId, userId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!request || request.status !== QuoteRequestStatus.PENDING) throw new Error("درخواست یافت نشد یا قابل لغو نیست");

    // Unlock balance
    await this.unlockBalance(userId, request.side, request.pricePair, Number(request.quantity), Number(request.price));

    request.status = QuoteRequestStatus.CANCELLED;
    await this.repo.save(request);

    // Update channel message
    if (request.channelChatId && request.channelMessageId) {
      await this.notifier.editMessageText(request.channelChatId, request.channelMessageId, "❌ *این سفارش لغو شد*", null);
    }
  }

  async findById(id: string): Promise<QuoteRequestEntity> {
    const request = await this.repo.findOne({
      where: { id },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!request) throw new Error("درخواست یافت نشد");
    return request;
  }

  async getPending(): Promise<QuoteRequestEntity[]> {
    return this.repo.find({
      where: { status: QuoteRequestStatus.PENDING },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
      order: { createAt: "ASC" },
    });
  }

  // ── Balance ──────────────────────────────────────────────

  private async lockBalance(queryRunner: any, userId: string, side: OrderSideEnum, pair: PricePairEntity, quantity: number, price?: number): Promise<void> {
    if (side === OrderSideEnum.BUY) {
      const wallet = await this.getWallet(queryRunner, userId, pair.quoteSymbol?.id);
      const required = quantity * (price || 0);
      if (wallet.freeBalance < required) {
        throw new Error(`موجودی ${pair.quoteSymbol?.slug || "IRR"} کافی نیست (نیاز: ${required})`);
      }
      wallet.freeBalance = Number((wallet.freeBalance - required).toFixed(8));
      wallet.lockedBalance = Number((wallet.lockedBalance + required).toFixed(8));
      await queryRunner.manager.save(wallet);
    } else {
      const wallet = await this.getWallet(queryRunner, userId, pair.baseSymbol?.id);
      if (wallet.freeBalance < quantity) {
        throw new Error(`موجودی ${pair.baseSymbol?.slug || "XAU"} کافی نیست (نیاز: ${quantity})`);
      }
      wallet.freeBalance = Number((wallet.freeBalance - quantity).toFixed(8));
      wallet.lockedBalance = Number((wallet.lockedBalance + quantity).toFixed(8));
      await queryRunner.manager.save(wallet);
    }
  }

  private async unlockBalance(userId: string, side: OrderSideEnum, pair: PricePairEntity, quantity: number, price?: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (side === OrderSideEnum.BUY) {
        const wallet = await this.getWallet(queryRunner, userId, pair.quoteSymbol?.id);
        const amount = quantity * (price || 0);
        wallet.lockedBalance = Math.max(0, Number((Number(wallet.lockedBalance) - amount).toFixed(8)));
        wallet.freeBalance = Number((Number(wallet.freeBalance) + amount).toFixed(8));
        await queryRunner.manager.save(wallet);
      } else {
        const wallet = await this.getWallet(queryRunner, userId, pair.baseSymbol?.id);
        wallet.lockedBalance = Math.max(0, Number((Number(wallet.lockedBalance) - quantity).toFixed(8)));
        wallet.freeBalance = Number((Number(wallet.freeBalance) + quantity).toFixed(8));
        await queryRunner.manager.save(wallet);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Compatibility ────────────────────────────────────────

  private isCompatible(
    sideA: OrderSideEnum, qtyA: number, priceA: number | undefined,
    sideB: OrderSideEnum, qtyB: number, priceB: number | undefined,
  ): boolean {
    // Same side can never match
    if (sideA === sideB) return false;

    const buyPrice = sideA === OrderSideEnum.BUY ? priceA : priceB;
    const sellPrice = sideA === OrderSideEnum.SELL ? priceA : priceB;
    const buyQty = sideA === OrderSideEnum.BUY ? qtyA : qtyB;
    const sellQty = sideA === OrderSideEnum.SELL ? qtyA : qtyB;

    // Price: buyer must be willing to pay >= seller's asking price
    if (buyPrice != null && sellPrice != null && buyPrice < sellPrice) return false;

    // Quantity: buyer's requested qty must be >= seller's offered qty (buyer can absorb)
    if (buyQty < sellQty) return false;

    return true;
  }

  // ── Notifications ────────────────────────────────────────

  private async alertMatchOpportunity(request: QuoteRequestEntity, candidate: QuoteRequestEntity): Promise<void> {
    const pair = request.pricePair;
    const symbol = pair?.baseSymbol?.slug || "—";

    const msg =
      `🔔 *فرصت تطبیق*\n\n` +
      `یک سفارش ${request.side === OrderSideEnum.BUY ? "خرید" : "فروش"} ${symbol} در صف انتظار وجود دارد.\n` +
      `مقدار: ${candidate.quantity} گرم\n` +
      `قیمت: ${candidate.price ? `${Number(candidate.price).toLocaleString()} تومان` : "قیمت بازار"}\n\n` +
      `جهت تطبیق و هماهنگی با طرف مقابل، لطفاً با پشتیبانی تماس بگیرید یا از شرایط درج شده در توضیحات استفاده کنید.`;

    const [ownerLink, candidateLink] = await Promise.all([
      this.userTelegram.findByUserId(request.userId),
      this.userTelegram.findByUserId(candidate.userId),
    ]);

    if (ownerLink) await this.notifier.sendDirectMessage(ownerLink.telegramId, msg);
    if (candidateLink) await this.notifier.sendDirectMessage(candidateLink.telegramId, msg);
  }

  private async notifyMatchedUsers(request: QuoteRequestEntity, matcherUserId: string): Promise<void> {
    const pair = request.pricePair;
    const symbol = pair?.baseSymbol?.slug || "—";
    const sideLabel = request.side === OrderSideEnum.BUY ? "خرید" : "فروش";
    const priceLabel = request.price ? `${Number(request.price).toLocaleString()} تومان` : "قیمت بازار";

    const msg =
      `✅ *تطبیق سفارش*\n\n` +
      `🔹 نوع: ${sideLabel} ${symbol}\n` +
      `🔹 مقدار: ${request.quantity} گرم\n` +
      `🔹 قیمت: ${priceLabel}\n\n` +
      `سفارش شما با موفقیت تطبیق یافت!`;

    const [ownerLink, matcherLink] = await Promise.all([
      this.userTelegram.findByUserId(request.userId),
      this.userTelegram.findByUserId(matcherUserId),
    ]);

    if (ownerLink) await this.notifier.sendDirectMessage(ownerLink.telegramId, msg);
    if (matcherLink) await this.notifier.sendDirectMessage(matcherLink.telegramId, msg);
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
    wallet.frozenFreeBalance = Number(wallet.frozenFreeBalance) || 0;
    wallet.frozenLockedBalance = Number(wallet.frozenLockedBalance) || 0;
    return wallet;
  }

  private async createTransaction(
    queryRunner: any,
    wallet: WalletEntity,
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
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: params.transactionType,
      status: TransactionStatusEnum.COMPLETED,
      amount: params.amount,
      fee: params.fee || 0,
      price: params.price || 0,
      description: params.description,
      metadata: {
        ...params.metadata,
        timestamp: new Date().toISOString(),
      },
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
      requestId: string;
      userId: string;
      description: string;
    },
  ): Promise<void> {
    await queryRunner.manager.save(SystemLedgerEntity, {
      symbolId: params.symbolId,
      type: params.type,
      amount: params.amount,
      orderId: params.requestId,
      userId: params.userId,
      description: params.description,
    });
  }
}