import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { WithdrawEvents } from "../../shared/constants/events.constants";

@Injectable()
export class WithdrawEventListener {
  private readonly logger = new Logger(WithdrawEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(WithdrawEvents.CREATED)
  async handleWithdrawCreated(payload: { userId: string; withdrawId: string; amount: number; type?: string; symbolId?: string }) {
    this.logger.log(`Withdraw created: user=${payload.userId} withdraw=${payload.withdrawId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SYSTEM,
      title: "ثبت درخواست برداشت",
      body: `درخواست برداشت شما به مبلغ ${payload.amount} ثبت شد و در انتظار تأیید است`,
      metadata: { withdrawId: payload.withdrawId, amount: payload.amount, type: payload.type },
    });
  }

  @OnEvent(WithdrawEvents.COMPLETED)
  async handleWithdrawCompleted(payload: { userId: string; withdrawId: string; amount: number }) {
    this.logger.log(`Withdraw completed: user=${payload.userId} withdraw=${payload.withdrawId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.SYSTEM,
      title: "برداشت انجام شد",
      body: `درخواست برداشت شما به مبلغ ${payload.amount} با موفقیت انجام شد`,
      metadata: { withdrawId: payload.withdrawId, amount: payload.amount },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    });
  }

  @OnEvent(WithdrawEvents.FAILED)
  async handleWithdrawFailed(payload: { userId: string; withdrawId: string; amount: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.SYSTEM,
      title: "برداشت ناموفق",
      body: `درخواست برداشت شما به مبلغ ${payload.amount} ناموفق بود`,
      metadata: { withdrawId: payload.withdrawId, amount: payload.amount },
    });
  }

  @OnEvent(WithdrawEvents.CANCELLED)
  async handleWithdrawCancelled(payload: { userId: string; withdrawId: string; amount: number }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.SYSTEM,
      title: "برداشت لغو شد",
      body: "درخواست برداشت شما لغو شد",
      metadata: { withdrawId: payload.withdrawId, amount: payload.amount },
    });
  }
}
