import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import {
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSide,
  VoucherStatus,
  WalletSubset,
} from "../accounting.enums";

/**
 * A manual accounting entry.
 *
 * Distinct from `system_ledger`, which the platform writes itself when an order
 * executes: this is what an accountant books by hand — a fee, a correction, a
 * settlement — and it therefore carries who entered it, who approved it, and
 * the movement it was entered under.
 */
@Entity("accounting_vouchers")
@Index(["status", "createAt"])
@Index(["customerId"])
export class AccountingVoucherEntity extends myBaseEntity {
  /** Human-facing reference, e.g. `DOC-14050012`. Unique and never reused. */
  @Column({ name: "voucher_code", type: "varchar", length: 40, unique: true })
  voucherCode: string;

  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId?: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "customer_id" })
  customer?: UserEntity | null;

  /** Kept alongside the relation so a booked voucher still reads correctly
   *  after the customer record changes name or is removed. */
  @Column({ name: "customer_name", type: "varchar", length: 200 })
  customerName: string;

  @Column({ name: "customer_type", type: "enum", enum: CustomerType })
  customerType: CustomerType;

  @Column({ type: "enum", enum: VoucherCategory })
  category: VoucherCategory;

  @Column({ type: "enum", enum: VoucherMovement })
  movement: VoucherMovement;

  /** Derived from `movement` on write; never accepted from a request. */
  @Column({ type: "enum", enum: VoucherSide })
  side: VoucherSide;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity, { nullable: true })
  @JoinColumn({ name: "symbol_id" })
  symbol?: SymbolEntity;

  /** In the symbol's own units — rial for a rial voucher. Always positive;
   *  direction lives in `movement`/`side`, not in the sign. */
  @Column({ type: "decimal", precision: 20, scale: 8 })
  amount: string;

  @Column({ name: "wallet_type", type: "varchar", length: 40 })
  walletType: string;

  @Column({ name: "wallet_subset", type: "enum", enum: WalletSubset })
  walletSubset: WalletSubset;

  @Column({ type: "varchar", length: 500 })
  description: string;

  @Column({ name: "extra_description", type: "varchar", length: 500, nullable: true })
  extraDescription?: string | null;

  /** The accounting date the operator entered, which need not be today. */
  @Column({ name: "document_date", type: "timestamptz" })
  documentDate: Date;

  @Column({ type: "enum", enum: VoucherStatus, default: VoucherStatus.DRAFT })
  status: VoucherStatus;

  @Column({ name: "created_by", type: "uuid" })
  createdBy: string;

  @ManyToOne(() => AdminEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator?: AdminEntity;

  /** Who booked or refused it — never the same admin who created it. */
  @Column({ name: "reviewed_by", type: "uuid", nullable: true })
  reviewedBy?: string | null;

  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: "review_note", type: "varchar", length: 500, nullable: true })
  reviewNote?: string | null;
}
