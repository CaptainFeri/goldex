import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";

@Injectable()
export class CreditEventListener {
  private readonly logger = new Logger(CreditEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent("credit.expired")
  async handleCreditExpired(payload: { userId: string; creditId: string; amount: number }) {
    this.logger.log(`Credit expired: user=${payload.userId} credit=${payload.creditId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.CREDIT,
      title: "اعتبار منقضی شد",
      body: `اعتبار شما به مبلغ ${payload.amount} منقضی شد`,
      metadata: { creditId: payload.creditId, amount: payload.amount },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS],
    });
  }

  @OnEvent("credit.margin_call")
  async handleMarginCall(payload: { userId: string; creditId: string; marginPercent: number }) {
    this.logger.log(`Margin call: user=${payload.userId} credit=${payload.creditId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.CREDIT,
      title: "هشدار مارجین",
      body: `اعتبار شما به سطح مارجین ${payload.marginPercent}% رسیده است`,
      metadata: { creditId: payload.creditId, marginPercent: payload.marginPercent },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS, NotificationChannelEnum.TELEGRAM],
    });
  }

  @OnEvent("credit.settled")
  async handleCreditSettled(payload: { userId: string; creditId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.CREDIT,
      title: "تسویه اعتبار",
      body: "اعتبار شما با موفقیت تسویه شد",
      metadata: { creditId: payload.creditId },
    });
  }

  @OnEvent("credit.reminder")
  async handleCreditReminder(payload: { userId: string; creditId: string; daysRemaining: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.CREDIT,
      title: "یادآوری اعتبار",
      body: `${payload.daysRemaining} روز تا پایان مهلت اعتبار شما باقی مانده است`,
      metadata: { creditId: payload.creditId, daysRemaining: payload.daysRemaining },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS],
    });
  }
}
