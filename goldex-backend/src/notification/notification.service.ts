import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindOptionsWhere } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationEntity } from "./entity/notification.entity";
import { NotificationPreferenceEntity } from "./entity/notification-preference.entity";
import { NotificationTypeEnum } from "./enum/notification-type.enum";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";
import { NotificationStatusEnum } from "./enum/notification-status.enum";
import { NotificationCategoryEnum } from "./enum/notification-category.enum";

export interface CreateNotificationDto {
  userId: string;
  type: NotificationTypeEnum;
  category?: NotificationCategoryEnum;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  channels?: NotificationChannelEnum[];
  userEmail?: string;
  userPhone?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferenceRepository: Repository<NotificationPreferenceEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateNotificationDto): Promise<NotificationEntity[]> {
    const category = dto.category || NotificationCategoryEnum.SYSTEM;
    const channels = dto.channels || [NotificationChannelEnum.IN_APP];
    const created: NotificationEntity[] = [];

    for (const channel of channels) {
      const isEnabled = await this.isChannelEnabled(dto.userId, channel, category);
      if (!isEnabled) continue;

      const notification = this.notificationRepository.create({
        userId: dto.userId,
        type: dto.type,
        category,
        channel,
        title: dto.title,
        body: dto.body,
        metadata: dto.metadata || {},
        status: NotificationStatusEnum.PENDING,
      });

      if (dto.userEmail) (notification as any).userEmail = dto.userEmail;
      if (dto.userPhone) (notification as any).userPhone = dto.userPhone;

      const saved = await this.notificationRepository.save(notification);
      created.push(saved);

      this.eventEmitter.emit("notification.send", saved);
    }

    return created;
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: NotificationEntity[]; total: number; unreadCount: number }> {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId, channel: NotificationChannelEnum.IN_APP },
      order: { sentAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notificationRepository.count({
      where: {
        userId,
        channel: NotificationChannelEnum.IN_APP,
        status: NotificationStatusEnum.SENT,
      },
    });

    return { data, total, unreadCount };
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationRepository.update(
      { id: notificationId, userId },
      {
        status: NotificationStatusEnum.READ,
        readAt: new Date(),
      },
    );
    this.eventEmitter.emit("notification.read", { notificationId, userId });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, channel: NotificationChannelEnum.IN_APP, status: NotificationStatusEnum.SENT },
      {
        status: NotificationStatusEnum.READ,
        readAt: new Date(),
      },
    );
    this.eventEmitter.emit("notification.read-all", { userId });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        userId,
        channel: NotificationChannelEnum.IN_APP,
        status: NotificationStatusEnum.SENT,
      },
    });
  }

  async updateStatus(id: string, status: NotificationStatusEnum, errorMessage?: string): Promise<void> {
    const update: Partial<NotificationEntity> = { status };
    if (status === NotificationStatusEnum.SENT) update.sentAt = new Date();
    if (status === NotificationStatusEnum.DELIVERED) update.deliveredAt = new Date();
    if (status === NotificationStatusEnum.FAILED) {
      update.failedAt = new Date();
      update.errorMessage = errorMessage;
    }
    await this.notificationRepository.update(id, update);
  }

  async getAdminStats(): Promise<any> {
    const total = await this.notificationRepository.count();
    const byChannel = await this.notificationRepository
      .createQueryBuilder("n")
      .select("n.channel", "channel")
      .addSelect("COUNT(*)", "count")
      .groupBy("n.channel")
      .getRawMany();
    const byStatus = await this.notificationRepository
      .createQueryBuilder("n")
      .select("n.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("n.status")
      .getRawMany();
    return { total, byChannel, byStatus };
  }

  private async isChannelEnabled(
    userId: string,
    channel: NotificationChannelEnum,
    category: NotificationCategoryEnum,
  ): Promise<boolean> {
    const pref = await this.preferenceRepository.findOne({
      where: { userId, channel, category },
    });
    return pref ? pref.enabled : true;
  }
}
