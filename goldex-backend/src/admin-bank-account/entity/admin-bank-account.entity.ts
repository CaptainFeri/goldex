import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { AdminBankAccountStatusEnum } from "../enum/admin-bank-account-status.enum";

/**
 * A bank account owned by the company, created and managed by an admin.
 *
 * Deliberately not p2p-scoped: `user_bank_account` is per-customer and
 * `shahin_accounts` is provider-sourced customer data, so nothing here
 * described a company account before. p2p admin settlement is the first
 * consumer; the manual deposit flow can adopt it later as the destination it
 * currently never shows the user.
 *
 * Direction is two independent booleans rather than a single section value, so
 * one account can receive from depositors, pay out to withdrawers, do both, or
 * sit parked — and each direction carries its own limits, because money coming
 * in is a reconciliation problem while money going out is a loss problem.
 */
@Entity("admin_bank_account")
@Index(["useForDeposit", "status", "priority"])
@Index(["useForWithdraw", "status", "priority"])
export class AdminBankAccountEntity extends myBaseEntity {
  @Column({ name: "title" })
  title: string;

  @Column({ name: "bank_name" })
  bankName: string;

  /** Must match the name the IBAN/card inquiry returns. */
  @Column({ name: "owner_name" })
  ownerName: string;

  @Column({ name: "account_number", nullable: true })
  accountNumber?: string;

  @Column({ name: "card_number", nullable: true })
  cardNumber?: string;

  @Column({ name: "iban", nullable: true, unique: true })
  iban?: string;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  /** Offered as a destination to depositors. */
  @Column({ name: "use_for_deposit", default: false })
  useForDeposit: boolean;

  /** Used as the source for admin payouts to withdrawers. */
  @Column({ name: "use_for_withdraw", default: false })
  useForWithdraw: boolean;

  /** Lower is tried first, evaluated per direction. */
  @Column({ name: "priority", type: "int", default: 0 })
  priority: number;

  @Column({ name: "deposit_daily_limit", type: "decimal", precision: 20, scale: 8, nullable: true })
  depositDailyLimit?: number;

  @Column({ name: "deposit_per_tx_limit", type: "decimal", precision: 20, scale: 8, nullable: true })
  depositPerTxLimit?: number;

  @Column({ name: "withdraw_daily_limit", type: "decimal", precision: 20, scale: 8, nullable: true })
  withdrawDailyLimit?: number;

  @Column({ name: "withdraw_per_tx_limit", type: "decimal", precision: 20, scale: 8, nullable: true })
  withdrawPerTxLimit?: number;

  @Column({ name: "deposit_used_today", type: "decimal", precision: 20, scale: 8, default: 0 })
  depositUsedToday: number;

  @Column({ name: "withdraw_used_today", type: "decimal", precision: 20, scale: 8, default: 0 })
  withdrawUsedToday: number;

  /** Rollover marker so a stale counter is treated as zero without a job run. */
  @Column({ name: "used_today_date", type: "date", nullable: true })
  usedTodayDate?: string;

  @Column({ name: "active_from_hour", type: "smallint", nullable: true })
  activeFromHour?: number;

  @Column({ name: "active_to_hour", type: "smallint", nullable: true })
  activeToHour?: number;

  @Column({
    name: "status",
    type: "enum",
    enum: AdminBankAccountStatusEnum,
    default: AdminBankAccountStatusEnum.ACTIVE,
  })
  status: AdminBankAccountStatusEnum;

  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt?: Date;

  @Column({ name: "verification_json", type: "jsonb", nullable: true })
  verificationJson?: Record<string, any>;

  @Column({ name: "notes", type: "text", nullable: true })
  notes?: string;
}
