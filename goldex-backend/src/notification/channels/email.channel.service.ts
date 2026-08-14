import { Injectable, Logger } from "@nestjs/common";
import { NotificationEntity } from "../entity/notification.entity";
import { NotificationChannel, SendResult } from "../interfaces/notification-channel.interface";
import { MailStrategyService } from "../../mail/strategy/mail-strategy.service";

@Injectable()
export class EmailChannelService implements NotificationChannel {
  readonly name = "EMAIL";
  private readonly logger = new Logger(EmailChannelService.name);

  constructor(private readonly mailStrategyService: MailStrategyService) {}

  async send(notification: NotificationEntity): Promise<SendResult> {
    try {
      const subject = notification.title;
      const body = notification.body;
      const userEmail = notification.metadata?.email;

      if (!userEmail) {
        return { success: false, error: "No email address available" };
      }

      await this.mailStrategyService.sendMail(userEmail, subject, body);
      this.logger.log(`Email sent to ${userEmail} for notification ${notification.id}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to send email: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }
}
