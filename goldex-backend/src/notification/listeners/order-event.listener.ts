import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { OrderEvents } from "../../shared/constants/events.constants";

@Injectable()
export class OrderEventListener {
  private readonly logger = new Logger(OrderEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(OrderEvents.PLACED)
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

  @OnEvent(OrderEvents.MATCHED)
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

  @OnEvent(OrderEvents.CANCELLED)
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

  @OnEvent(OrderEvents.REJECTED)
  async handleOrderRejected(payload: { userId: string; orderId: string; orderCode?: string; reason?: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.TRADE,
      title: "سفارش رد شد",
      body: payload.reason ? `سفارش شما رد شد. دلیل: ${payload.reason}` : "سفارش شما رد شد",
      metadata: { orderId: payload.orderId, orderCode: payload.orderCode },
    });
  }
}
