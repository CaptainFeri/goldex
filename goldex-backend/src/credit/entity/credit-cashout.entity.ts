import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { CreditEntity } from "./credit.entity";
import { CreditOrderEntity } from "./credit-order.entity";
import { CashoutSourceEnum } from "../enum/cashout-source.enum";

/**
 * Audit record of a credit cash-out: one credit purchase converted into a
 * fully-paid holding while the credit facility stays open.
 *
 * The purchase amount (the credit that was utilised) is paid either from the
 * user's DEPOSIT wallet or out of the frozen collateral, the purchased asset
 * moves CREDIT → DEPOSIT, and the repaid amount is returned to the facility's
 * available credit. Paying from collateral also shrinks the facility
 * proportionally (less collateral ⇒ less leveraged capacity) — the amounts of
 * that reduction are recorded here.
 */
@Entity("credit_cashout")
@Index("IDX_CREDIT_CASHOUT_CREDIT", ["creditId"])
@Index("IDX_CREDIT_CASHOUT_TRADE", ["creditOrderId"])
export class CreditCashoutEntity extends myBaseEntity {
  @ManyToOne(() => CreditEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_id" })
  credit: CreditEntity;

  @Column({ name: "credit_id" })
  creditId: string;

  @ManyToOne(() => CreditOrderEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_order_id" })
  creditOrder: CreditOrderEntity;

  @Column({ name: "credit_order_id", type: "uuid" })
  creditOrderId: string;

  @Column({ name: "order_id", type: "uuid", nullable: true })
  orderId: string | null;

  @Column({ type: "varchar", length: 20, name: "source" })
  source: CashoutSourceEnum;

  /** Credit repaid by this cash-out, in the credit currency (e.g. IRR). */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "amount" })
  amount: number;

  /** Cash-out fee rate applied (%). */
  @Column({ type: "decimal", precision: 5, scale: 2, default: 0, name: "fee_percent" })
  feePercent: number;

  /** Cash-out fee charged to the user, in the credit currency. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "fee_amount" })
  feeAmount: number;

  /** Conversion commission booked when collateral was used (collateral units). */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "spread_profit" })
  spreadProfit: number;

  /** Total platform profit of this cash-out, valued in the credit currency. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "system_profit_value" })
  systemProfitValue: number;

  /** Symbol of the purchased asset released to the deposit wallet. */
  @Column({ name: "asset_symbol_id", type: "uuid", nullable: true })
  assetSymbolId: string | null;

  /** Amount of the purchased asset released to the deposit wallet. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "asset_amount" })
  assetAmount: number;

  /** Collateral consumed (in collateral units) when paying from collateral. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "collateral_consumed" })
  collateralConsumed: number;

  /** Collateral mark price used to value the consumed collateral. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "mark_price" })
  markPrice: number;

  /** Credit limit removed because the collateral backing it was consumed. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "credit_limit_reduction" })
  creditLimitReduction: number;

  /** Sell capacity removed for the same reason (in the collateral symbol). */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "sell_capacity_reduction" })
  sellCapacityReduction: number;

  @Column({ type: "varchar", length: 50, nullable: true, name: "requested_by" })
  requestedBy: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, name: "admin_id" })
  adminId: string | null;

  @Column({ type: "text", nullable: true, name: "notes" })
  notes: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
