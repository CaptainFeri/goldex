import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * Who has read which inbox item.
 *
 * A separate table because the notification is shared: marking it read must be
 * per-operator, or one person opening the inbox would clear the badge for
 * everybody.
 */
@Entity("admin_notification_reads")
@Index(["notificationId", "adminId"], { unique: true })
export class AdminNotificationReadEntity extends myBaseEntity {
  @Column({ name: "notification_id", type: "uuid" })
  notificationId: string;

  @Index()
  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @Column({ name: "read_at", type: "timestamptz", default: () => "now()" })
  readAt: Date;
}
