import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationEntity } from "../entity/notification.entity";
import { NotificationChannel, SendResult } from "../interfaces/notification-channel.interface";
import { NotificationStatusEnum } from "../enum/notification-status.enum";
import { NotificationGateway } from "../notification.gateway";

@Injectable()
export class InAppChannelService implements NotificationChannel {
  readonly name = "IN_APP";
  private readonly logger = new Logger(InAppChannelService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async send(notification: NotificationEntity): Promise<SendResult> {
    try {
      notification.status = NotificationStatusEnum.SENT;
      notification.sentAt = new Date();
      const saved = await this.notificationRepository.save(notification);
      this.logger.log(`In-app notification saved for user ${notification.userId}`);
      this.notificationGateway.sendNewNotification(saved.userId, {
        id: saved.id,
        type: saved.type,
        category: saved.category,
        title: saved.title,
        body: saved.body,
        sentAt: saved.sentAt,
        readAt: saved.readAt,
        status: saved.status,
      });
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to save in-app notification: ${(error as Error).message}`);
      return { success: false, error: (error as Error).message };
    }
  }
}
