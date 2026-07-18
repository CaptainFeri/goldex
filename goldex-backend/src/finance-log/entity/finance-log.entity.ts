import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { CreditActionEnum } from "../../credit/enum/credit-action.enum";

@Entity("finance_log")
export class FinanceLogEntity extends myBaseEntity {
  @ManyToOne(() => AdminEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string;

  @Column({ name: "credit_id", type: "uuid", nullable: true })
  creditId: string;

  @Column({ name: "wallet_id", type: "uuid", nullable: true })
  walletId: string;

  @Column({ name: "order_id", type: "uuid", nullable: true })
  orderId: string;

  @Column({ type: "enum", enum: CreditActionEnum, name: "action_type" })
  actionType: CreditActionEnum;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  @Column({ name: "action_time", type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  actionTime: Date;
}
