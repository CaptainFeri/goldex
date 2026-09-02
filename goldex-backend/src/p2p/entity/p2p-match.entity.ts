import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { P2pDepositIntentEntity } from "./p2p-deposit-intent.entity";
import { P2pWithdrawPartEntity } from "./p2p-withdraw-part.entity";
import { P2pPaymentProofEntity } from "./p2p-payment-proof.entity";
import { P2pMatchSourceEnum, P2pMatchStatusEnum } from "../enum/p2p.enums";

@Entity("p2p_match")
@Index(["status"])
@Index(["responseDeadlineAt"])
@Index(["reservationExpiresAt"])
export class P2pMatchEntity extends myBaseEntity {
  @Column({ name: "deposit_intent_id", type: "uuid" })
  depositIntentId: string;

  @ManyToOne(() => P2pDepositIntentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "deposit_intent_id" })
  depositIntent: P2pDepositIntentEntity;

  @Column({ name: "withdraw_part_id", type: "uuid", nullable: true })
  withdrawPartId?: string;

  @ManyToOne(() => P2pWithdrawPartEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "withdraw_part_id" })
  withdrawPart?: P2pWithdrawPartEntity;

  @Column({ name: "amount", type: "decimal", precision: 20, scale: 8 })
  amount: number;

  @Column({ name: "score", type: "decimal", precision: 12, scale: 4, nullable: true })
  score?: number;

  /** Persisted so an admin can review why the engine chose this part. */
  @Column({ name: "score_breakdown_json", type: "jsonb", nullable: true })
  scoreBreakdownJson?: Record<string, number>;

  @Column({
    name: "source",
    type: "enum",
    enum: P2pMatchSourceEnum,
    default: P2pMatchSourceEnum.CUSTOMER,
  })
  source: P2pMatchSourceEnum;

  /** Set when the deposit was filled against a company account instead. */
  @Column({ name: "admin_account_id", type: "uuid", nullable: true })
  adminAccountId?: string;

  /**
   * What the depositor was actually told to pay, frozen at reservation. Editing
   * or retiring the underlying account must never rewrite this.
   */
  @Column({ name: "destination_snapshot_json", type: "jsonb", nullable: true })
  destinationSnapshotJson?: Record<string, any>;

  @Column({
    name: "status",
    type: "enum",
    enum: P2pMatchStatusEnum,
    default: P2pMatchStatusEnum.RESERVED,
  })
  status: P2pMatchStatusEnum;

  @Column({ name: "reserved_at", type: "timestamptz", nullable: true })
  reservedAt?: Date;

  @Column({ name: "reservation_expires_at", type: "timestamptz", nullable: true })
  reservationExpiresAt?: Date;

  @Column({ name: "response_deadline_at", type: "timestamptz", nullable: true })
  responseDeadlineAt?: Date;

  @Column({ name: "settlement_deadline_at", type: "timestamptz", nullable: true })
  settlementDeadlineAt?: Date;

  @Column({ name: "settled_at", type: "timestamptz", nullable: true })
  settledAt?: Date;

  @OneToOne(() => P2pPaymentProofEntity, (p) => p.match)
  paymentProof?: P2pPaymentProofEntity;
}
