import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { CreditOrderEntity } from "./credit-order.entity";

@Entity("credit")
export class CreditEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @Column({ name: "credit_code", type: "varchar", length: 50, unique: true })
  creditCode: string;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "amount" })
  amount: number;

  @Column({ type: "enum", enum: CreditStatusEnum, default: CreditStatusEnum.PENDING, name: "status" })
  status: CreditStatusEnum;

  @Column({ name: "has_call_margin", type: "boolean", default: false })
  hasCallMargin: boolean;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "call_margin_percent" })
  callMarginPercent: number;

  @Column({ type: "int", default: 24, name: "reminder_timer_hours" })
  reminderTimerHours: number;

  @Column({ type: "timestamptz", nullable: true, name: "reminder_last_sent_at" })
  reminderLastSentAt: Date;

  @Column({ type: "timestamptz", nullable: false, name: "expire_at" })
  expireAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "activated_at" })
  activatedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "settled_at" })
  settledAt: Date;

  @Column({ type: "text", nullable: true, name: "notes" })
  notes: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "settle_image_path" })
  settleImagePath: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "settled_by_admin_id" })
  settledByAdminId: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  @OneToMany(() => CreditOrderEntity, (co) => co.credit)
  creditOrders: CreditOrderEntity[];
}
