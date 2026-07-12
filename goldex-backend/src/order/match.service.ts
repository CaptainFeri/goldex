import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrderEntity } from "./order.entity";
import { OrderStatusEnum } from "./enum/order.status.enum";
import { OrderSideEnum } from "./enum/order.side.enum";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";

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

    // No self-match: the requester cannot match their own order
    if (order.userId === requesterUserId) {
      return { message: "❌ نمی‌توانید سفارش خود را تطبیق دهید", showAlert: true };
    }

    // If the original order is BUY, the requester must SELL (need XAU)
    // If the original order is SELL, the requester must BUY (need IRR)
    const pair = order.pricePair;
    if (!pair) {
      return { message: "❌ اطلاعات جفت‌ارز یافت نشد", showAlert: true };
    }

    if (order.side === OrderSideEnum.BUY) {
      // Requester must sell → need base asset (XAU)
      const baseWallet = await this.walletRepo.findOne({
        where: { userId: requesterUserId, symbolId: pair.baseSymbol?.id },
      });
      const required = Number(order.quantity);
      const available = Number(baseWallet?.freeBalance || 0);
      if (available < required) {
        return {
          message: `❌ موجودی ${pair.baseSymbol?.slug || "XAU"} کافی نیست (موجودی: ${available}، نیاز: ${required})`,
          showAlert: true,
        };
      }
    } else {
      // Requester must buy → need quote asset (IRR)
      const quoteWallet = await this.walletRepo.findOne({
        where: { userId: requesterUserId, symbolId: pair.quoteSymbol?.id },
      });
      const required = Number(order.quantity) * (Number(order.price) || 0);
      const available = Number(quoteWallet?.freeBalance || 0);
      if (available < required) {
        return {
          message: `❌ موجودی ${pair.quoteSymbol?.slug || "IRR"} کافی نیست (موجودی: ${available}، نیاز: ${required})`,
          showAlert: true,
        };
      }
    }

    this.logger.log(`Match request: user ${requesterUserId} matched order ${order.orderCode}`);

    // TODO: The actual match execution (create counter-order, freeze balances, etc.)
    // will be implemented in a follow-up. For now, we just validate and record the intent.

    return { message: "✅ درخواست تطابق ثبت شد", showAlert: false };
  }
}
