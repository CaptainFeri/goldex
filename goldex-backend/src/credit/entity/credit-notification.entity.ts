import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { CreditEntity } from "./credit.entity";
import { CreditNotificationTypeEnum } from "../enum/credit-notification-type.enum";

@Entity("credit_notification")
export class CreditNotificationEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => CreditEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_id" })
  credit: CreditEntity;

  @Column({ name: "credit_id" })
  creditId: string;

  @Column({ type: "enum", enum: CreditNotificationTypeEnum, name: "type" })
  type: CreditNotificationTypeEnum;

  @Column({ type: "text" })
  message: string;

  @Column({ type: "boolean", default: false, name: "is_read" })
  isRead: boolean;

  @Column({ type: "timestamptz", nullable: true, name: "read_at" })
  readAt: Date;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP", name: "sent_at" })
  sentAt: Date;
}
