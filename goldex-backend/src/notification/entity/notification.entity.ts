import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { NotificationStatusEnum } from "../enum/notification-status.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";

@Entity("notifications")
export class NotificationEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ type: "enum", enum: NotificationTypeEnum, name: "type" })
  type: NotificationTypeEnum;

  @Column({ type: "enum", enum: NotificationCategoryEnum, name: "category", default: NotificationCategoryEnum.SYSTEM })
  category: NotificationCategoryEnum;

  @Column({ type: "enum", enum: NotificationChannelEnum, name: "channel" })
  channel: NotificationChannelEnum;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  body: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @Column({ type: "enum", enum: NotificationStatusEnum, name: "status", default: NotificationStatusEnum.PENDING })
  status: NotificationStatusEnum;

  @Column({ type: "timestamptz", nullable: true, name: "read_at" })
  readAt: Date;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP", name: "sent_at" })
  sentAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "delivered_at" })
  deliveredAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "failed_at" })
  failedAt: Date;

  @Column({ type: "text", nullable: true, name: "error_message" })
  errorMessage: string;
}
