import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../shared/entity/base.entity";
import { UserEntity } from "../user/entity/user.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WithdrawStatusEnum } from "./enum/withdraw-status.enum";

@Entity("withdraw")
export class WithdrawEntity extends myBaseEntity {
  @Column({ name: "user_id", nullable: false })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "symbol_id", nullable: false })
  symbolId: string;

  @ManyToOne(() => SymbolEntity)
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  @Column({ name: "type", nullable: false })
  type: string;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: false })
  amount: number;

  @Column({
    type: "enum",
    enum: WithdrawStatusEnum,
    default: WithdrawStatusEnum.PENDING,
    name: "status",
  })
  status: WithdrawStatusEnum;

  @Column({ name: "admin_id", nullable: true })
  adminId: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ name: "picture_path", nullable: true })
  picturePath: string;

  @Column("jsonb", { nullable: true })
  metadata: Record<string, any>;

  @Column({ name: "gateway_code", nullable: true })
  gatewayCode: string;

  @Column({ name: "completed_at", nullable: true })
  completedAt: Date;

  @Column({ name: "warehouse_request_id", type: "uuid", nullable: true })
  warehouseRequestId: string;
}
