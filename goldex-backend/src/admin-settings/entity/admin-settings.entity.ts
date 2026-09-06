import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";

/**
 * One admin's own preferences.
 *
 * Separate from `admin` because these are settings an operator changes for
 * themselves, while the `admin` row carries identity and access that other
 * people administer. Mixing them would put "did you want the daily email"
 * in the same table as "is this account suspended".
 */
@Entity("admin_settings")
export class AdminSettingsEntity extends myBaseEntity {
  @Column({ name: "admin_id", type: "uuid", unique: true })
  adminId: string;

  @OneToOne(() => AdminEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin?: AdminEntity;

  @Column({ name: "two_factor", type: "boolean", default: false })
  twoFactor: boolean;

  @Column({ name: "biometric", type: "boolean", default: false })
  biometric: boolean;

  @Column({ name: "unknown_login_alert", type: "boolean", default: true })
  unknownLoginAlert: boolean;

  @Column({ name: "trade_alerts", type: "boolean", default: true })
  tradeAlerts: boolean;

  @Column({ name: "daily_email_report", type: "boolean", default: false })
  dailyEmailReport: boolean;

  @Column({ name: "system_alerts", type: "boolean", default: true })
  systemAlerts: boolean;
}
