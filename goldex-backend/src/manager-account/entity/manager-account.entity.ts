import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { ManagerAccountStatusEnum } from "../enum/manager-account.enums";

/**
 * A manager's trading account, one per admin per asset.
 *
 * It is charged only by a senior admin approving a funding request, and it is
 * the sole source a manager's arbitrage bots can draw on. `allocatedBalance`
 * is the part frozen into bots: it is still the manager's, but it cannot be
 * allocated again or withdrawn while a bot holds it.
 *
 * Invariant: availableBalance + allocatedBalance is the account's total, and
 * every change to either is written to the ledger.
 */
@Entity("manager_account")
@Index(["adminId", "symbolId"], { unique: true })
export class ManagerAccountEntity extends myBaseEntity {
  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @ManyToOne(() => AdminEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  /** Free to allocate to a bot or to be withdrawn. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "available_balance" })
  availableBalance: number;

  /** Frozen into running bots as their risk budget. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "allocated_balance" })
  allocatedBalance: number;

  @Column({
    type: "varchar",
    length: 20,
    default: ManagerAccountStatusEnum.ACTIVE,
    name: "status",
  })
  status: ManagerAccountStatusEnum;

  @Column({ type: "text", nullable: true })
  note: string | null;
}
