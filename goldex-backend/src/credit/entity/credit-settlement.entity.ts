import { Entity, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { CreditEntity } from "./credit.entity";
import { CreditOrderEntity } from "./credit-order.entity";
import { SettlementWorkflowStatusEnum } from "../enum/settlement-workflow-status.enum";

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
    default: SettlementWorkflowStatusEnum.REQUESTED,
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
}