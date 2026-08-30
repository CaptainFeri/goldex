import { NotificationEntity } from "../entity/notification.entity";

export interface SendResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(notification: NotificationEntity): Promise<SendResult>;
}
