import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationEntity } from "./entity/notification.entity";
import { NotificationService } from "./notification.service";
import { InAppChannelService } from "./channels/in-app.channel.service";
import { EmailChannelService } from "./channels/email.channel.service";
import { SmsChannelService } from "./channels/sms.channel.service";
import { TelegramChannelService } from "./channels/telegram.channel.service";
import { NotificationChannel } from "./interfaces/notification-channel.interface";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";
import { NotificationStatusEnum } from "./enum/notification-status.enum";

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private readonly channels: Map<NotificationChannelEnum, NotificationChannel>;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly inAppChannel: InAppChannelService,
    private readonly emailChannel: EmailChannelService,
    private readonly smsChannel: SmsChannelService,
    private readonly telegramChannel: TelegramChannelService,
  ) {
    this.channels = new Map();
    this.channels.set(NotificationChannelEnum.IN_APP, this.inAppChannel);
    this.channels.set(NotificationChannelEnum.EMAIL, this.emailChannel);
    this.channels.set(NotificationChannelEnum.SMS, this.smsChannel);
    this.channels.set(NotificationChannelEnum.TELEGRAM, this.telegramChannel);
  }

  @OnEvent("notification.send")
  async handleSend(notification: NotificationEntity): Promise<void> {
    const channel = this.channels.get(notification.channel as NotificationChannelEnum);
    if (!channel) {
      this.logger.warn(`No channel handler for ${notification.channel}`);
      await this.notificationService.updateStatus(notification.id, NotificationStatusEnum.FAILED, "No channel handler");
      return;
    }

    this.logger.log(`Dispatching notification ${notification.id} via ${channel.name}`);
    const result = await channel.send(notification);

    if (result.success) {
      await this.notificationService.updateStatus(notification.id, NotificationStatusEnum.SENT);
      this.logger.log(`Notification ${notification.id} sent via ${channel.name}`);
    } else {
      await this.notificationService.updateStatus(notification.id, NotificationStatusEnum.FAILED, result.error);
      this.logger.error(`Notification ${notification.id} failed via ${channel.name}: ${result.error}`);
    }
  }
}
