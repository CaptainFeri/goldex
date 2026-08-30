import { Entity, Column, ManyToOne, JoinColumn, Unique } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";

@Entity("notification_preferences")
@Unique(["userId", "channel", "category"])
export class NotificationPreferenceEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ type: "enum", enum: NotificationChannelEnum })
  channel: NotificationChannelEnum;

  @Column({ type: "enum", enum: NotificationCategoryEnum })
  category: NotificationCategoryEnum;

  @Column({ type: "boolean", default: true })
  enabled: boolean;
}
