import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TelegramNotifierService } from "../../telegram-notifier/telegram-notifier.service";
import { UserTelegramEntity } from "../../user-telegram/user-telegram.entity";
import { NotificationEntity } from "../entity/notification.entity";
import { NotificationChannel, SendResult } from "../interfaces/notification-channel.interface";

@Injectable()
export class TelegramChannelService implements NotificationChannel {
  readonly name = "TELEGRAM";
  private readonly logger = new Logger(TelegramChannelService.name);

  constructor(
    private readonly telegramNotifier: TelegramNotifierService,
    @InjectRepository(UserTelegramEntity)
    private readonly userTelegramRepository: Repository<UserTelegramEntity>,
  ) {}

  async send(notification: NotificationEntity): Promise<SendResult> {
    try {
      const telegramLink = await this.userTelegramRepository.findOne({
        where: { userId: notification.userId },
      });
      if (!telegramLink) {
        return { success: false, error: "User has no linked Telegram account" };
      }
      const text = `*${notification.title}*\n\n${notification.body}`;
      await this.telegramNotifier.sendDirectMessage(telegramLink.telegramId, text);
      this.logger.log(`Telegram notification sent to user ${notification.userId}`);
      return { success: true, externalId: String(telegramLink.telegramId) };
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }
}
