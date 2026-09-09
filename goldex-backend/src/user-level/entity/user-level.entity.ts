import { Column, Entity, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { CreditEnforceModeEnum } from "../../credit/enum/credit-enforce-mode.enum";
import { CreditPairConfig } from "../../credit/dto/credit-pair-config.dto";

@Entity("user_level")
export class UserLevelEntity extends myBaseEntity {
  @Column({ type: "varchar", length: 100, unique: true })
  name: string;

  @Column({ type: "varchar", length: 100, unique: true })
  slug: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "int", default: 0 })
  priority: number;

  @Column({ type: "boolean", default: false, name: "is_default" })
  isDefault: boolean;

  @Column({ type: "jsonb", default: {} })
  features: Record<string, any>;

  // ── Credit v2 config ──────────────────────────────────────────────
  // Base (credit) symbol for this level, e.g. IRR. Level pairs must be
  // quoted in this symbol (XAU/IRR).
  @ManyToOne(() => SymbolEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "credit_base_symbol_id" })
  creditBaseSymbol: SymbolEntity;

  @Column({ name: "credit_base_symbol_id", type: "uuid", nullable: true })
  creditBaseSymbolId: string;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true, name: "credit_max_leverage" })
  creditMaxLeverage: number;

  // Drawdown threshold as % loss vs frozen collateral value.
  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true, name: "credit_drawdown_percent" })
  creditDrawdownPercent: number;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "credit_enforce_on_drawdown",
  })
  creditEnforceOnDrawdown: CreditEnforceModeEnum;

  @Column({
    type: "enum",
    enum: CreditEnforceModeEnum,
    nullable: true,
    name: "credit_enforce_on_expiry",
  })
  creditEnforceOnExpiry: CreditEnforceModeEnum;

  // When true the system force-closes credit-linked requests whose pend
  // deadline (pair x/y/z) passed; when false it only alerts.
  @Column({ type: "boolean", nullable: true, name: "credit_enforce_request_deadline" })
  creditEnforceRequestDeadline: boolean;

  @Column({ type: "int", nullable: true, name: "credit_max_parallel_requests" })
  creditMaxParallelRequests: number;

  // Max nominal (notional) exposure a facility on this level may hold, in the
  // credit base symbol units (0/null = unlimited). Handoff §9 max_credit_notional.
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "credit_max_notional" })
  creditMaxNotional: number;

  // Max fraction (0..1) of total collateral that may be locked at once
  // (0/null = unlimited). Handoff §9 max_total_locked_collateral.
  @Column({ type: "decimal", precision: 5, scale: 4, nullable: true, name: "credit_max_locked_collateral" })
  creditMaxLockedCollateral: number;

  // When true, a user on this level must have an approved KYC before opening a
  // self-service credit facility. When false, KYC is not required.
  @Column({ type: "boolean", nullable: true, default: true, name: "credit_require_kyc" })
  creditRequireKyc: boolean;

  // ── Credit "abilities" moved out of the features jsonb ─────────────
  // Whether credit trading is allowed on this level (defaults to enabled).
  @Column({ type: "boolean", nullable: true, default: true, name: "credit_trading_enabled" })
  creditTradingEnabled: boolean;

  // Max credit amount in the base (credit) symbol — 0/null = unlimited.
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "credit_max_amount" })
  creditMaxAmount: number;

  // Max credit duration in days — 0/null = no expiry.
  @Column({ type: "int", nullable: true, name: "credit_max_duration_days" })
  creditMaxDurationDays: number;

  // ── Credit risk measurement defaults ───────────────────────────────
  // The margin-call ladder, as equity over open exposure in percent. A
  // facility is warned at the first rung, margin-called at the second and
  // force-liquidated at the third. Null leaves the engine's own default.
  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "credit_warning_margin_percent",
  })
  creditWarningMarginPercent: number;

  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "credit_margin_call_percent",
  })
  creditMarginCallPercent: number;

  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "credit_liquidation_margin_percent",
  })
  creditLiquidationMarginPercent: number;

  // Whether a warned or margin-called facility may still open exposure.
  @Column({ type: "boolean", nullable: true, name: "credit_reduce_only_on_warning" })
  creditReduceOnlyOnWarning: boolean;

  // Max chained credit trades (hops) before settlement is required.
  @Column({ type: "int", nullable: true, name: "credit_max_execution_level" })
  creditMaxExecutionLevel: number;

  // Per-trade size bounds for credit orders, in the traded base symbol.
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "credit_min_trade_size" })
  creditMinTradeSize: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "credit_max_trade_size" })
  creditMaxTradeSize: number;

  // ── Credit facility abilities (what this level's users may do) ─────
  // Whether opening a facility needs an admin to approve it first. When true
  // the request is created PENDING with the collateral already frozen, and no
  // credit line is issued until an admin approves.
  @Column({
    type: "boolean",
    nullable: true,
    default: false,
    name: "credit_require_admin_approval_for_creation",
  })
  creditRequireAdminApprovalForCreation: boolean;

  // Whether settling needs an admin to approve it before anything moves.
  @Column({
    type: "boolean",
    nullable: true,
    default: false,
    name: "credit_require_admin_approval_for_settlement",
  })
  creditRequireAdminApprovalForSettlement: boolean;

  // Whether the user may settle at all, or only an admin may close facilities.
  @Column({ type: "boolean", nullable: true, default: true, name: "credit_allow_user_settlement" })
  creditAllowUserSettlement: boolean;

  // Whether a single credit purchase may be cashed out without closing the
  // facility, from which wallets, and at what platform fee.
  @Column({ type: "boolean", nullable: true, default: true, name: "credit_cashout_enabled" })
  creditCashoutEnabled: boolean;

  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
    name: "credit_cashout_fee_percent",
  })
  creditCashoutFeePercent: number;

  // Subset of CashoutSourceEnum ("DEPOSIT" | "COLLATERAL"); null = both.
  @Column({ type: "jsonb", nullable: true, name: "credit_allowed_cashout_sources" })
  creditAllowedCashoutSources: string[];

  // Subset of SettlementMethodEnum ("FULL" | "NET" | "TOPUP"); null = all.
  @Column({ type: "jsonb", nullable: true, name: "credit_settlement_methods" })
  creditSettlementMethods: string[];

  // Whether offsetting credit trades may be netted at settlement.
  @Column({ type: "boolean", nullable: true, default: false, name: "credit_netting_enabled" })
  creditNettingEnabled: boolean;

  // Per-pair credit structure: { [pairId]: CreditPairConfig }. When a pair is
  // configured here its settings override the level-level credit defaults above.
  @Column({ type: "jsonb", nullable: true, name: "credit_configs" })
  creditConfigs: Record<string, CreditPairConfig>;

  @ManyToMany(() => PricePairEntity, (p) => p.levels)
  @JoinTable({
    name: "user_level_pairs",
    joinColumn: { name: "level_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "pair_id", referencedColumnName: "id" },
  })
  pairs: PricePairEntity[];

  @OneToMany(() => UserEntity, (u) => u.level)
  users: UserEntity[];
}
