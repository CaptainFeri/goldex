import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";

@Injectable()
export class OrderEventListener {
  private readonly logger = new Logger(OrderEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent("order.placed")
  async handleOrderPlaced(payload: { userId: string; orderId: string; symbol: string; side: string; quantity: number }) {
    this.logger.log(`Order placed: user=${payload.userId} order=${payload.orderId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.TRADE,
      title: "سفارش ثبت شد",
      body: `سفارش ${payload.side === "BUY" ? "خرید" : "فروش"} ${payload.quantity} ${payload.symbol} ثبت شد`,
      metadata: { orderId: payload.orderId, symbol: payload.symbol, side: payload.side, quantity: payload.quantity },
    });
  }

  @OnEvent("order.matched")
  async handleOrderMatched(payload: { userId: string; orderId: string; symbol: string; quantity: number; price: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.TRADE,
      title: "سفارش تطابق یافت",
      body: `سفارش ${payload.symbol} به تعداد ${payload.quantity} با قیمت ${payload.price} تطابق یافت`,
      metadata: { orderId: payload.orderId, symbol: payload.symbol, quantity: payload.quantity, price: payload.price },
    });
  }

  @OnEvent("order.cancelled")
  async handleOrderCancelled(payload: { userId: string; orderId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.TRADE,
      title: "سفارش لغو شد",
      body: "سفارش شما لغو شد",
      metadata: { orderId: payload.orderId },
    });
  }
}
