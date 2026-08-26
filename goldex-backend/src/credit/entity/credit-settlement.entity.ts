import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { CreditEntity } from "./credit.entity";
import { CreditOrderEntity } from "./credit-order.entity";
import { SettlementWorkflowStatusEnum, SettlementMethodEnum, SettlementValuationStateEnum } from "../enum/settlement-workflow-status.enum";

/**
 * Delivery-based settlement workflow (handoff §7, §13).
 *
 * One settlement lifecycle per credit trade:
 *   SETTLEMENT_REQUESTED → ASSET_RECEIVED → ASSET_VERIFIED → LIABILITY_CLEARED
 *   → ASSET_SETTLED → COLLATERAL_RELEASED → CLOSED | FAILED
 *
 * The workflow is idempotent — re-running a step must not double-transfer.
 */
@Entity("credit_settlement")
@Index("IDX_CREDIT_SETTLEMENT_CREDIT", ["creditId"])
@Index("IDX_CREDIT_SETTLEMENT_TRADE", ["creditOrderId"])
@Index("IDX_CREDIT_SETTLEMENT_STATUS", ["status"])
export class CreditSettlementEntity extends myBaseEntity {
  @ManyToOne(() => CreditEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "credit_id" })
  credit: CreditEntity;

  @Column({ name: "credit_id" })
  creditId: string;

  @ManyToOne(() => CreditOrderEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "credit_order_id" })
  creditOrder: CreditOrderEntity | null;

  @Column({ name: "credit_order_id", type: "uuid", nullable: true })
  creditOrderId: string | null;

  /** The asset the user must deliver to clear the negative credit leg. */
  @Column({ name: "required_asset_symbol_id", type: "uuid", nullable: true })
  requiredAssetSymbolId: string | null;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "required_amount" })
  requiredAmount: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "received_amount" })
  receivedAmount: number;

  @Column({
    type: "enum",
    enum: SettlementWorkflowStatusEnum,
    default: SettlementWorkflowStatusEnum.SETTLEMENT_REQUESTED,
    name: "status",
  })
  status: SettlementWorkflowStatusEnum;

  @Column({ type: "varchar", length: 50, nullable: true, name: "requested_by" })
  requestedBy: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "requested_at" })
  requestedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "received_at" })
  receivedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "verified_at" })
  verifiedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "liability_cleared_at" })
  liabilityClearedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "asset_settled_at" })
  assetSettledAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "collateral_released_at" })
  collateralReleasedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "closed_at" })
  closedAt: Date;

  @Column({ type: "text", nullable: true, name: "notes" })
  notes: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  // ── Handoff §6 (revision 1): approval, valuation, method & funding ──────

  @Column({ type: "varchar", length: 20, nullable: true, name: "settlement_method" })
  settlementMethod: SettlementMethodEnum | null;

  @Column({ type: "varchar", length: 40, nullable: true, name: "valuation_state" })
  valuationState: SettlementValuationStateEnum | null;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "collateral_value" })
  collateralValue: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "exposure_value" })
  exposureValue: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "shortfall" })
  shortfall: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "required_top_up" })
  requiredTopUp: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "funded_amount" })
  fundedAmount: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "release_amount" })
  releaseAmount: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "realized_pnl" })
  realizedPnL: number;

  @Column({ type: "jsonb", nullable: true, name: "final_collateral_state" })
  finalCollateralState: any;

  @Column({ type: "varchar", length: 50, nullable: true, name: "approved_by" })
  approvedBy: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "approved_at" })
  approvedAt: Date;

  @Column({ type: "text", nullable: true, name: "approval_reason" })
  approvalReason: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, name: "rejected_by" })
  rejectedBy: string | null;

  @Column({ type: "timestamptz", nullable: true, name: "rejected_at" })
  rejectedAt: Date;

  @Column({ type: "text", nullable: true, name: "rejection_reason" })
  rejectionReason: string | null;
}