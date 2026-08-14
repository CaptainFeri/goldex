import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { TicketEvents } from "../../shared/constants/events.constants";

@Injectable()
export class TicketEventListener {
  private readonly logger = new Logger(TicketEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(TicketEvents.CREATED)
  async handleTicketCreated(payload: { ticketId: string; userId: string; subject: string }) {
    this.logger.log(`Ticket created: ${payload.ticketId} for user ${payload.userId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SUPPORT,
      title: "تیکت ثبت شد",
      body: `تیکت شما با عنوان «${payload.subject}» ثبت شد`,
      metadata: { ticketId: payload.ticketId },
      channels: [NotificationChannelEnum.IN_APP],
    });
  }

  @OnEvent(TicketEvents.ASSIGNED)
  async handleTicketAssigned(payload: { ticketId: string; userId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SUPPORT,
      title: "پیگیری تیکت",
      body: "تیکت شما در دست بررسی کارشناسان قرار گرفت",
      metadata: { ticketId: payload.ticketId },
      channels: [NotificationChannelEnum.IN_APP],
    });
  }

  @OnEvent(TicketEvents.STATUS_CHANGED)
  async handleTicketStatusChanged(payload: { ticketId: string; userId: string; status: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SUPPORT,
      title: "تغییر وضعیت تیکت",
      body: `وضعیت تیکت شما به «${payload.status}» تغییر یافت`,
      metadata: { ticketId: payload.ticketId, status: payload.status },
      channels: [NotificationChannelEnum.IN_APP],
    });
  }

  @OnEvent(TicketEvents.MESSAGE_ADDED)
  async handleTicketMessageAdded(payload: { ticketId: string; userId: string; senderType: string }) {
    if (payload.senderType !== "ADMIN") return;
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SUPPORT,
      title: "پاسخ جدید تیکت",
      body: "پاسخ جدیدی به تیکت شما ارسال شده است",
      metadata: { ticketId: payload.ticketId },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    });
  }
}
