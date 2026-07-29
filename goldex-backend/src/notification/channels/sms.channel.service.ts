import { Injectable, Logger } from "@nestjs/common";
import { SmsService } from "../../sms/sms.service";
import { NotificationEntity } from "../entity/notification.entity";
import { NotificationChannel, SendResult } from "../interfaces/notification-channel.interface";

@Injectable()
export class SmsChannelService implements NotificationChannel {
  readonly name = "SMS";
  private readonly logger = new Logger(SmsChannelService.name);

  constructor(private readonly smsService: SmsService) {}

  async send(notification: NotificationEntity): Promise<SendResult> {
    try {
      const phone = (notification as any).userPhone || (notification.metadata as any)?.phone;
      if (!phone) {
        return { success: false, error: "No phone number available" };
      }
      const message = `${notification.title}: ${notification.body}`;
      const result = await this.smsService.sendSMS(phone, message);
      if (result.success) {
        this.logger.log(`SMS sent to ${phone}`);
        return { success: true, externalId: result.messageId };
      }
      return { success: false, error: result.error || "SMS send failed" };
    } catch (error) {
      this.logger.error(`Failed to send SMS: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }
}
