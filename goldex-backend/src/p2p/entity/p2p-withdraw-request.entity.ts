import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, VersionColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { WithdrawEntity } from "../../withdraw/withdraw.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { P2pSplitPolicyEnum, P2pWithdrawStateEnum } from "../enum/p2p.enums";
import { P2pWithdrawPartEntity } from "./p2p-withdraw-part.entity";

/**
 * The p2p detail of a withdrawal, 1:1 with the `withdraw` row that carries it.
 * Splitting it out keeps `withdraw.status` as the coarse public status other
 * symbol types already rely on, while the spec's state machine lives here.
 */
@Entity("p2p_withdraw_request")
@Index(["state", "symbolId"])
export class P2pWithdrawRequestEntity extends myBaseEntity {
  @Column({ name: "withdraw_id", type: "uuid", unique: true })
  withdrawId: string;

  @ManyToOne(() => WithdrawEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "withdraw_id" })
  withdraw: WithdrawEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity)
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  @Column({ name: "total_amount", type: "decimal", precision: 20, scale: 8 })
  totalAmount: number;

  @Column({ name: "completed_amount", type: "decimal", precision: 20, scale: 8, default: 0 })
  completedAmount: number;

  @Column({ name: "remaining_amount", type: "decimal", precision: 20, scale: 8 })
  remainingAmount: number;

  /** Still held in the withdrawer's wallet.lockedBalance for this request. */
  @Column({ name: "locked_amount", type: "decimal", precision: 20, scale: 8, default: 0 })
  lockedAmount: number;

  @Column({ name: "split_policy", type: "enum", enum: P2pSplitPolicyEnum })
  splitPolicy: P2pSplitPolicyEnum;

  @Column({ name: "required_parts", type: "int", nullable: true })
  requiredParts?: number;

  @Column({ name: "min_parts", type: "int", nullable: true })
  minParts?: number;

  @Column({ name: "max_parts", type: "int", nullable: true })
  maxParts?: number;

  // Structured constraints get their own columns so matching never has to
  // parse free text (spec §3.2).
  @Column({ name: "min_part_amount", type: "decimal", precision: 20, scale: 8, nullable: true })
  minPartAmount?: number;

  @Column({ name: "max_part_amount", type: "decimal", precision: 20, scale: 8, nullable: true })
  maxPartAmount?: number;

  @Column({ name: "preferred_bank", nullable: true })
  preferredBank?: string;

  @Column({ name: "allowed_from", type: "timestamptz", nullable: true })
  allowedFrom?: Date;

  @Column({ name: "allowed_until", type: "timestamptz", nullable: true })
  allowedUntil?: Date;

  /** Display and admin review only — never fed to the matching engine. */
  @Column({ name: "free_conditions", type: "text", nullable: true })
  freeConditions?: string;

  /** Where depositors pay; snapshotted onto each match at reservation time. */
  @Column({ name: "destination_bank_account_id", type: "uuid", nullable: true })
  destinationBankAccountId?: string;

  @Column({ name: "destination_snapshot_json", type: "jsonb", nullable: true })
  destinationSnapshotJson?: Record<string, any>;

  @Column({
    name: "state",
    type: "enum",
    enum: P2pWithdrawStateEnum,
    default: P2pWithdrawStateEnum.PENDING_MATCHING,
  })
  state: P2pWithdrawStateEnum;

  @Column({ name: "expires_at", type: "timestamptz", nullable: true })
  expiresAt?: Date;

  @VersionColumn({ name: "version" })
  version: number;

  @OneToMany(() => P2pWithdrawPartEntity, (part) => part.request)
  parts: P2pWithdrawPartEntity[];
}
