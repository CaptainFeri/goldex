import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { Entity, Column, ManyToOne, JoinColumn, Index, ManyToMany } from "typeorm";
import { UserLevelEntity } from "../../user-level/entity/user-level.entity";
import { RoutingModeEnum } from "../../pricing-route/enum/routing-mode.enum";
import {
  CreditDeadlineModeEnum,
  DEFAULT_DEADLINE_TIMEZONE,
} from "../../credit/enum/credit-deadline-mode.enum";

@Entity("price_pairs")
@Index(["baseId", "quoteId"], { unique: true })
export class PricePairEntity extends myBaseEntity {
  @Column({ name: "base_id", type: "uuid" })
  baseId: string;

  @Column({ name: "quote_id", type: "uuid" })
  quoteId: string;

  @ManyToOne(() => SymbolEntity, (symbol) => symbol.basePairs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "base_id" })
  baseSymbol: SymbolEntity;

  @ManyToOne(() => SymbolEntity, (symbol) => symbol.quotePairs, { onDelete: "CASCADE" })
  @JoinColumn({ name: "quote_id" })
  quoteSymbol: SymbolEntity;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true })
  price: number;

  @Column({ type: "timestamp", name: "last_updated", nullable: true })
  lastUpdated: Date;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "best_buy_price" })
  bestBuyPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "best_sell_price" })
  bestSellPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "best_buy_gram_price" })
  bestBuyGramPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "best_sell_gram_price" })
  bestSellGramPrice: number;

  @Column({ length: 50, nullable: true, name: "best_buy_provider" })
  bestBuyProvider: string;

  @Column({ length: 50, nullable: true, name: "best_sell_provider" })
  bestSellProvider: string;

  @Column({ default: false, name: "is_valid" })
  isValid: boolean;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0, name: "buy_commission" })
  buyCommission: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0, name: "sell_commission" })
  sellCommission: number;

  @Column({ length: 50, nullable: true, name: "trading_view_symbol" })
  tradingViewSymbol: string;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "min_buy" })
  minBuy: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "max_buy" })
  maxBuy: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "min_sell" })
  minSell: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "max_sell" })
  maxSell: number;

  @Column({ type: "int", default: 2, name: "decimals" })
  decimals: number;

  // ── Credit pend-deadline convention (per side) ───────────────────
  // How a credit-linked request on this pair ages: NONE (never), RELATIVE
  // (x/y/z hours from registration) or DAILY_CUTOFF (a wall-clock time of day).
  // Rows predating the mode carry hours only, so null reads as RELATIVE.
  @Column({
    type: "varchar",
    length: 20,
    nullable: true,
    name: "buy_deadline_mode",
  })
  buyDeadlineMode: CreditDeadlineModeEnum | null;

  @Column({
    type: "varchar",
    length: 20,
    nullable: true,
    name: "sell_deadline_mode",
  })
  sellDeadlineMode: CreditDeadlineModeEnum | null;

  // DAILY_CUTOFF: wall-clock "HH:mm" in `deadlineTimezone`. A request made past
  // the cutoff is due at the next open day's cutoff.
  @Column({ type: "varchar", length: 5, nullable: true, name: "buy_warn_time" })
  buyWarnTime: string | null;

  @Column({ type: "varchar", length: 5, nullable: true, name: "buy_expire_time" })
  buyExpireTime: string | null;

  @Column({ type: "varchar", length: 5, nullable: true, name: "sell_warn_time" })
  sellWarnTime: string | null;

  @Column({ type: "varchar", length: 5, nullable: true, name: "sell_expire_time" })
  sellExpireTime: string | null;

  // The zone every deadline on this pair is reckoned in. A cutoff is a local
  // trading-desk time, so it must not drift with the server's clock.
  @Column({
    type: "varchar",
    length: 64,
    nullable: true,
    default: DEFAULT_DEADLINE_TIMEZONE,
    name: "deadline_timezone",
  })
  deadlineTimezone: string | null;

  // Dated exceptions ("YYYY-MM-DD") on top of the weekly closures below —
  // the holidays on which this pair does not settle.
  @Column({ type: "varchar", length: 10, array: true, nullable: true, name: "holiday_dates" })
  holidayDates: string[] | null;

  // RELATIVE: x = warn hours, y = expire hours. z (grace) applies to both modes.
  @Column({ type: "int", nullable: true, name: "buy_warn_hours" })
  buyWarnHours: number;

  @Column({ type: "int", nullable: true, name: "buy_expire_hours" })
  buyExpireHours: number;

  @Column({ type: "int", nullable: true, name: "buy_grace_hours" })
  buyGraceHours: number;

  @Column({ type: "int", nullable: true, name: "sell_warn_hours" })
  sellWarnHours: number;

  @Column({ type: "int", nullable: true, name: "sell_expire_hours" })
  sellExpireHours: number;

  @Column({ type: "int", nullable: true, name: "sell_grace_hours" })
  sellGraceHours: number;

  // Weekly closures skipped by every deadline on this pair
  // (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday).
  @Column({ type: "int", array: true, nullable: true, name: "excluded_days" })
  excludedDays: number[];

  // ── Price routing (direct vs bridged) ───────────────────────────
  /**
   * How this pair picks between its direct quote and one composed through a
   * bridge symbol (e.g. XAU/IRR from XAU/USD × USD/IRR).
   */
  @Column({ type: "varchar", length: 10, default: RoutingModeEnum.AUTO, name: "routing_mode" })
  routingMode: RoutingModeEnum;

  /** Preferred bridge symbol. Null lets the resolver search every eligible one. */
  @Column({ name: "bridge_symbol_id", type: "uuid", nullable: true })
  bridgeSymbolId: string | null;

  @ManyToOne(() => SymbolEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "bridge_symbol_id" })
  bridgeSymbol: SymbolEntity | null;

  /**
   * Refuse a bridged price that differs from a usable direct price by more than
   * this percentage — a guard against one stale leg poisoning the quote.
   */
  @Column({
    type: "decimal",
    precision: 10,
    scale: 4,
    nullable: true,
    name: "bridge_max_deviation_percent",
  })
  bridgeMaxDeviationPercent: number | null;

  @ManyToMany(() => UserLevelEntity, (l) => l.pairs)
  levels: UserLevelEntity[];
}
