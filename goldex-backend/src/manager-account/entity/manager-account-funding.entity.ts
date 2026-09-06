import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ManagerAccountEntity } from "./manager-account.entity";
import {
  ManagerFundingDirectionEnum,
  ManagerFundingStatusEnum,
} from "../enum/manager-account.enums";

/**
 * A request to charge or unwind a manager's account, which only a senior admin
 * can approve. Nothing moves on the account until the approval lands, and the
 * requester and the approver are always different people.
 */
@Entity("manager_account_funding")
@Index(["accountId", "status"])
export class ManagerAccountFundingEntity extends myBaseEntity {
  @Column({ name: "account_id", type: "uuid" })
  accountId: string;

  @ManyToOne(() => ManagerAccountEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "account_id" })
  account: ManagerAccountEntity;

  /** The manager whose account this charges — not necessarily the requester. */
  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @Column({ type: "decimal", precision: 20, scale: 8 })
  amount: number;

  @Column({ type: "varchar", length: 10, name: "direction" })
  direction: ManagerFundingDirectionEnum;

  @Column({
    type: "varchar",
    length: 20,
    default: ManagerFundingStatusEnum.PENDING,
    name: "status",
  })
  status: ManagerFundingStatusEnum;

  @Column({ name: "requested_by_admin_id", type: "uuid" })
  requestedByAdminId: string;

  @Column({ name: "reviewed_by_admin_id", type: "uuid", nullable: true })
  reviewedByAdminId: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt: Date | null;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  /** Why a senior admin rejected it, so the manager can see the answer. */
  @Column({ name: "review_note", type: "text", nullable: true })
  reviewNote: string | null;
}
