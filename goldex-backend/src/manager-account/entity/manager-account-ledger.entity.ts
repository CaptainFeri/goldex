import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ManagerAccountEntity } from "./manager-account.entity";
import { ManagerLedgerTypeEnum } from "../enum/manager-account.enums";

/**
 * One movement on a manager account. Balances are derived state; this is the
 * record that explains them, which is what makes a bot's losses auditable
 * against the capital that was frozen for it.
 */
@Entity("manager_account_ledger")
@Index(["accountId", "createAt"])
export class ManagerAccountLedgerEntity extends myBaseEntity {
  @Column({ name: "account_id", type: "uuid" })
  accountId: string;

  @ManyToOne(() => ManagerAccountEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "account_id" })
  account: ManagerAccountEntity;

  @Column({ type: "varchar", length: 30 })
  type: ManagerLedgerTypeEnum;

  /** Signed change to the available balance. */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "available_delta", default: 0 })
  availableDelta: number;

  /** Signed change to the allocated (frozen) balance. */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "allocated_delta", default: 0 })
  allocatedDelta: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "available_after" })
  availableAfter: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "allocated_after" })
  allocatedAfter: number;

  /** The bot this movement belongs to, for allocation, release and P&L rows. */
  @Column({ name: "bot_id", type: "uuid", nullable: true })
  botId: string | null;

  @Column({ name: "funding_id", type: "uuid", nullable: true })
  fundingId: string | null;

  @Column({ name: "actor_admin_id", type: "uuid", nullable: true })
  actorAdminId: string | null;

  @Column({ type: "text", nullable: true })
  description: string | null;
}
