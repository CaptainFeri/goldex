import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { DepositEvents } from "../../shared/constants/events.constants";

@Injectable()
export class DepositEventListener {
  private readonly logger = new Logger(DepositEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(DepositEvents.CREATED)
  async handleDepositCreated(payload: { userId: string; depositId: string; amount: number; type?: string; symbolId?: string }) {
    this.logger.log(`Deposit created: user=${payload.userId} deposit=${payload.depositId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SYSTEM,
      title: "ثبت درخواست واریز",
      body: `درخواست واریز شما به مبلغ ${payload.amount} ثبت شد و در انتظار تأیید است`,
      metadata: { depositId: payload.depositId, amount: payload.amount, type: payload.type },
    });
  }

  @OnEvent(DepositEvents.COMPLETED)
  async handleDepositCompleted(payload: { userId: string; depositId: string; amount: number }) {
    this.logger.log(`Deposit completed: user=${payload.userId} deposit=${payload.depositId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.SYSTEM,
      title: "واریز تأیید شد",
      body: `واریز شما به مبلغ ${payload.amount} با موفقیت انجام شد و به کیف پول اضافه گردید`,
      metadata: { depositId: payload.depositId, amount: payload.amount },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    });
  }

  @OnEvent(DepositEvents.FAILED)
  async handleDepositFailed(payload: { userId: string; depositId: string; amount: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.SYSTEM,
      title: "واریز ناموفق",
      body: `درخواست واریز شما به مبلغ ${payload.amount} ناموفق بود`,
      metadata: { depositId: payload.depositId, amount: payload.amount },
    });
  }

  @OnEvent(DepositEvents.CANCELLED)
  async handleDepositCancelled(payload: { userId: string; depositId: string; amount: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.SYSTEM,
      title: "واریز لغو شد",
      body: "درخواست واریز شما لغو شد",
      metadata: { depositId: payload.depositId, amount: payload.amount },
    });
  }
}
