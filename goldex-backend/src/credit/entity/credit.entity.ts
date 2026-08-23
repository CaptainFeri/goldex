import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { SettlementStateEnum } from "../enum/settlement-state.enum";
import { RiskStateEnum } from "../enum/risk-state.enum";
import { CreditEnforceModeEnum } from "../enum/credit-enforce-mode.enum";
import { CreditOrderEntity } from "./credit-order.entity";

@Entity("credit")
export class CreditEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string;

  @Column({ name: "credit_code", type: "varchar", length: 50, unique: true })
  creditCode: string;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "amount" })
  amount: number;

  @Column({ type: "enum", enum: CreditStatusEnum, default: CreditStatusEnum.PENDING, name: "status" })
  status: CreditStatusEnum;

  @Column({ name: "has_call_margin", type: "boolean", default: false })
  hasCallMargin: boolean;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "call_margin_percent" })
  callMarginPercent: number;

  @Column({ type: "int", default: 24, name: "reminder_timer_hours" })
  reminderTimerHours: number;

  @Column({ type: "timestamptz", nullable: true, name: "reminder_last_sent_at" })
  reminderLastSentAt: Date;

  @Column({ type: "timestamptz", nullable: false, name: "expire_at" })
  expireAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "activated_at" })
  activatedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "settled_at" })
  settledAt: Date;

  @Column({ type: "text", nullable: true, name: "notes" })
  notes: string;

  @Column({ type: "varchar", length: 255, nullable: true, name: "settle_image_path" })
  settleImagePath: string;

  @Column({ type: "varchar", length: 50, nullable: true, name: "settled_by_admin_id" })
  settledByAdminId: string;

  @Column({ type: "int", nullable: true, name: "max_execution_trade_level" })
  maxExecutionTradeLevel: number;

  @Column({ type: "int", default: 0, name: "executed_trade_level" })
  executedTradeLevel: number;

  @Column({ type: "int", nullable: true, name: "max_concurrent_orders" })
  maxConcurrentOrders: number;

  @Column({ type: "int", nullable: true, name: "max_trade_chain_depth" })
  maxTradeChainDepth: number;

  @Column({ type: "int", default: 0, name: "current_trade_chain_depth" })
  currentTradeChainDepth: number;

  // ── Credit v2 facility fields (user self-service leverage) ─────────
  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true, name: "leverage" })
  leverage: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "credit_limit" })
  creditLimit: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "used_credit" })
  usedCredit: number;

  @Column({ name: "collateral_symbol_id", type: "uuid", nullable: true })
  collateralSymbolId: string;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "collateral_amount" })
  collateralAmount: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "initial_collateral_value" })
  initialCollateralValue: number;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "current_collateral_value" })
  currentCollateralValue: number;

  // Drawdown threshold snapshot (% loss vs frozen collateral) from the level.
  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "drawdown_percent" })
  drawdownPercent: number;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0, name: "last_drawdown_percent" })
  lastDrawdownPercent: number;

  @Column({ name: "credit_base_symbol_id", type: "uuid", nullable: true })
  creditBaseSymbolId: string;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "enforce_on_drawdown",
  })
  enforceOnDrawdown: CreditEnforceModeEnum;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "enforce_on_expiry",
  })
  enforceOnExpiry: CreditEnforceModeEnum;

  @Column({ type: "boolean", nullable: true, name: "enforce_request_deadline" })
  enforceRequestDeadline: boolean;

  @Column({ type: "enum", enum: SettlementStateEnum, default: SettlementStateEnum.GREEN, name: "settlement_state" })
  settlementState: SettlementStateEnum;

  @Column({ type: "enum", enum: RiskStateEnum, default: RiskStateEnum.NORMAL, name: "risk_state" })
  riskState: RiskStateEnum;

  @Column({ type: "int", default: 8, name: "green_duration_hours" })
  greenDurationHours: number;

  @Column({ type: "int", default: 4, name: "yellow_duration_hours" })
  yellowDurationHours: number;

  @Column({ type: "int", default: 4, name: "red_duration_hours" })
  redDurationHours: number;

  @Column({ type: "timestamptz", nullable: true, name: "settlement_yellow_at" })
  settlementYellowAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "settlement_red_at" })
  settlementRedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "settlement_admin_review_at" })
  settlementAdminReviewAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "risk_warning_at" })
  riskWarningAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "risk_margin_call_at" })
  riskMarginCallAt: Date;

  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "outstanding_shortfall" })
  outstandingShortfall: number;

  @Column({ type: "boolean", default: false, name: "is_in_default" })
  isInDefault: boolean;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;

  @OneToMany(() => CreditOrderEntity, (co) => co.credit)
  creditOrders: CreditOrderEntity[];
}
