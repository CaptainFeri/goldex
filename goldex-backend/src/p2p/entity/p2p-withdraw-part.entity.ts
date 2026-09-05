import { Column, Entity, Index, JoinColumn, ManyToOne, VersionColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { P2pWithdrawRequestEntity } from "./p2p-withdraw-request.entity";
import { P2pPartStatusEnum } from "../enum/p2p.enums";

/** One fillable slice of a withdrawal request. The matching hot path. */
@Entity("p2p_withdraw_part")
@Index(["status", "targetAmount"])
export class P2pWithdrawPartEntity extends myBaseEntity {
  @Column({ name: "withdraw_request_id", type: "uuid" })
  withdrawRequestId: string;

  @ManyToOne(() => P2pWithdrawRequestEntity, (r) => r.parts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "withdraw_request_id" })
  request: P2pWithdrawRequestEntity;

  @Column({ name: "sequence_no", type: "int" })
  sequenceNo: number;

  @Column({ name: "target_amount", type: "decimal", precision: 20, scale: 8 })
  targetAmount: number;

  @Column({ name: "confirmed_amount", type: "decimal", precision: 20, scale: 8, default: 0 })
  confirmedAmount: number;

  @Column({
    name: "status",
    type: "enum",
    enum: P2pPartStatusEnum,
    default: P2pPartStatusEnum.OPEN,
  })
  status: P2pPartStatusEnum;

  /** At most one live reservation per part; enforced by a partial unique index. */
  @Column({ name: "active_reservation_id", type: "uuid", nullable: true })
  activeReservationId?: string;

  @Column({ name: "reserved_until", type: "timestamptz", nullable: true })
  reservedUntil?: Date;

  @VersionColumn({ name: "version" })
  version: number;
}
