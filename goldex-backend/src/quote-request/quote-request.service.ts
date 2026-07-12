import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, DataSource } from "typeorm";
import { QuoteRequestEntity, QuoteRequestStatus } from "./quote-request.entity";
import { OrderSideEnum } from "../order/enum/order.side.enum";
import { UserTelegramService } from "../user-telegram/user-telegram.service";
import { TelegramNotifierService } from "../telegram-notifier/telegram-notifier.service";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";

interface CreateQuoteRequestResult {
  request: QuoteRequestEntity;
  matchAlert?: boolean;
}

@Injectable()
export class QuoteRequestService {
  private readonly logger = new Logger(QuoteRequestService.name);

  constructor(
    @InjectRepository(QuoteRequestEntity)
    private readonly repo: Repository<QuoteRequestEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    private readonly dataSource: DataSource,
    private readonly userTelegram: UserTelegramService,
    private readonly notifier: TelegramNotifierService,
  ) {}

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

    // Lock balance first
    await this.lockBalance(userId, side, pair, quantity, price);

    // Save as PENDING
    const entity = this.repo.create({ userId, side, pricePairId, quantity, price, notes, status: QuoteRequestStatus.PENDING });
    const saved = await this.repo.save(entity);

    // Broadcast to channel with match button
    const msgInfo = await this.broadcastToChannel(saved, pair);
    if (msgInfo) {
      saved.channelChatId = String(msgInfo.chatId);
      saved.channelMessageId = String(msgInfo.messageId);
      await this.repo.save(saved);
    }

    // Check for potential match — only alert, never auto-match
    const oppositeSide = side === OrderSideEnum.BUY ? OrderSideEnum.SELL : OrderSideEnum.BUY;
    const candidate = await this.repo.findOne({
      where: { side: oppositeSide, pricePairId, status: QuoteRequestStatus.PENDING, userId: Not(userId) },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
      order: { createAt: "ASC" },
    });

    if (candidate && this.isCompatible(side, quantity, price, candidate.side, Number(candidate.quantity), Number(candidate.price))) {
      await this.alertMatchOpportunity(saved, candidate);
      return { request: saved, matchAlert: true };
    }

    return { request: saved };
  }

  async match(requestId: string, matcherUserId: string): Promise<QuoteRequestEntity> {
    const request = await this.repo.findOne({
      where: { id: requestId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!request) throw new Error("درخواست یافت نشد");
    if (request.status !== QuoteRequestStatus.PENDING) throw new Error("این درخواست دیگر فعال نیست");
    if (request.userId === matcherUserId) throw new Error("نمی‌توانید درخواست خود را تطبیق دهید");

    const pair = request.pricePair;
    const matcherSide = request.side === OrderSideEnum.BUY ? OrderSideEnum.SELL : OrderSideEnum.BUY;

    // Validate compatibility
    if (!this.isCompatible(matcherSide, Number(request.quantity), Number(request.price), request.side, Number(request.quantity), Number(request.price))) {
      throw new Error("قیمت یا مقدار سفارش‌ها با یکدیگر سازگار نیست");
    }

    // Lock matcher's balance, unlock creator's
    await this.lockBalance(matcherUserId, matcherSide, pair, Number(request.quantity), Number(request.price));
    await this.unlockBalance(request.userId, request.side, pair, Number(request.quantity), Number(request.price));

    // Mark as matched
    request.status = QuoteRequestStatus.MATCHED;
    request.matchedUserId = matcherUserId;
    request.matchedAt = new Date();
    await this.repo.save(request);

    // Update channel message — remove button, show matched
    if (request.channelChatId && request.channelMessageId) {
      await this.updateChannelMessageMatched(request, pair);
    }

    // Notify both users
    await this.notifyMatchedUsers(request, matcherUserId);

    return request;
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

  async getPending(): Promise<QuoteRequestEntity[]> {
    return this.repo.find({
      where: { status: QuoteRequestStatus.PENDING },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
      order: { createAt: "ASC" },
    });
  }

  // ── Balance ──────────────────────────────────────────────

  private async lockBalance(userId: string, side: OrderSideEnum, pair: PricePairEntity, quantity: number, price?: number): Promise<void> {
    if (side === OrderSideEnum.BUY) {
      const wallet = await this.walletRepo.findOne({ where: { userId, symbolId: pair.quoteSymbol?.id } });
      const required = quantity * (price || 0);
      if (!wallet || Number(wallet.freeBalance) < required) {
        throw new Error(`موجودی ${pair.quoteSymbol?.slug || "IRR"} کافی نیست (نیاز: ${required})`);
      }
      wallet.freeBalance = Number((Number(wallet.freeBalance) - required).toFixed(8));
      wallet.lockedBalance = Number((Number(wallet.lockedBalance) + required).toFixed(8));
      await this.walletRepo.save(wallet);
    } else {
      const wallet = await this.walletRepo.findOne({ where: { userId, symbolId: pair.baseSymbol?.id } });
      if (!wallet || Number(wallet.freeBalance) < quantity) {
        throw new Error(`موجودی ${pair.baseSymbol?.slug || "XAU"} کافی نیست (نیاز: ${quantity})`);
      }
      wallet.freeBalance = Number((Number(wallet.freeBalance) - quantity).toFixed(8));
      wallet.lockedBalance = Number((Number(wallet.lockedBalance) + quantity).toFixed(8));
      await this.walletRepo.save(wallet);
    }
  }

  private async unlockBalance(userId: string, side: OrderSideEnum, pair: PricePairEntity, quantity: number, price?: number): Promise<void> {
    if (side === OrderSideEnum.BUY) {
      const wallet = await this.walletRepo.findOne({ where: { userId, symbolId: pair.quoteSymbol?.id } });
      if (!wallet) return;
      const amount = quantity * (price || 0);
      wallet.lockedBalance = Math.max(0, Number((Number(wallet.lockedBalance) - amount).toFixed(8)));
      wallet.freeBalance = Number((Number(wallet.freeBalance) + amount).toFixed(8));
      await this.walletRepo.save(wallet);
    } else {
      const wallet = await this.walletRepo.findOne({ where: { userId, symbolId: pair.baseSymbol?.id } });
      if (!wallet) return;
      wallet.lockedBalance = Math.max(0, Number((Number(wallet.lockedBalance) - quantity).toFixed(8)));
      wallet.freeBalance = Number((Number(wallet.freeBalance) + quantity).toFixed(8));
      await this.walletRepo.save(wallet);
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

  private async updateChannelMessageMatched(request: QuoteRequestEntity, pair: PricePairEntity): Promise<void> {
    const symbol = pair?.baseSymbol?.slug || "—";
    const sideLabel = request.side === OrderSideEnum.BUY ? "خرید" : "فروش";
    const priceLabel = request.price ? `${Number(request.price).toLocaleString()} تومان` : "قیمت بازار";

    const text =
      `✅ *سفارش تطبیق یافت*\n\n` +
      `🔹 نوع: ${sideLabel} ${symbol}\n` +
      `🔹 مقدار: ${request.quantity} گرم\n` +
      `🔹 قیمت: ${priceLabel}\n\n` +
      `🟢 این سفارش تکمیل شده است.`;

    await this.notifier.editMessageText(request.channelChatId, request.channelMessageId, text, null);
  }

  private async broadcastToChannel(request: QuoteRequestEntity, pair: PricePairEntity): Promise<{ chatId: number; messageId: number } | null> {
    const symbol = pair?.baseSymbol?.slug || "—";
    const sideLabel = request.side === OrderSideEnum.BUY ? "خرید" : "فروش";
    const priceLabel = request.price ? `${Number(request.price).toLocaleString()} تومان` : "قیمت بازار";
    const notesLabel = request.notes ? `\n📝 ${request.notes}` : "";

    const text =
      `📊 *سفارش جدید*\n\n` +
      `🔹 نوع: ${sideLabel} ${symbol}\n` +
      `🔹 مقدار: ${request.quantity} گرم\n` +
      `🔹 قیمت: ${priceLabel}${notesLabel}`;

    return this.notifier.sendQuoteRequestToChannel(text, request.id);
  }
}
