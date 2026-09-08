import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { ArbitrageBotAllocationEntity } from "./arbitrage-bot-allocation.entity";
import {
  ArbitrageBotExecutionModeEnum,
  ArbitrageBotStatusEnum,
} from "../enum/arbitrage-bot.enums";
import {
  ArbitrageBotNotificationConfig,
  ArbitrageBotScope,
  ArbitrageBotThresholds,
  DEFAULT_BOT_NOTIFICATIONS,
  DEFAULT_BOT_SCOPE,
  DEFAULT_BOT_THRESHOLDS,
} from "../arbitrage-bot.types";

/**
 * An admin-defined arbitrage bot.
 *
 * A bot is three things at once: a filter over the live opportunity stream
 * (which pairs, markets and providers it cares about), a risk budget (capital
 * frozen out of its owner's manager accounts), and a notification policy.
 *
 * The frozen allocations are what make the bot safe to run: for each asset it
 * holds, it may keep trading only while the realized losses in that asset stay
 * under its stop-loss. When every asset's budget is spent the bot halts itself
 * and waits for a person.
 */
@Entity("arbitrage_bot")
@Index(["ownerAdminId", "status"])
export class ArbitrageBotEntity extends myBaseEntity {
  @Column({ length: 120 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ name: "owner_admin_id", type: "uuid" })
  ownerAdminId: string;

  @ManyToOne(() => AdminEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_admin_id" })
  ownerAdmin: AdminEntity;

  @Column({
    type: "varchar",
    length: 20,
    default: ArbitrageBotStatusEnum.DRAFT,
  })
  @Index()
  status: ArbitrageBotStatusEnum;

  @Column({
    type: "varchar",
    length: 20,
    default: ArbitrageBotExecutionModeEnum.SIGNAL_ONLY,
    name: "execution_mode",
  })
  executionMode: ArbitrageBotExecutionModeEnum;

  // ── What it watches ──────────────────────────────────────────────────────

  @Column({ type: "jsonb", default: () => `'${JSON.stringify(DEFAULT_BOT_SCOPE)}'::jsonb` })
  scope: ArbitrageBotScope;

  @Column({ type: "jsonb", default: () => `'${JSON.stringify(DEFAULT_BOT_THRESHOLDS)}'::jsonb` })
  thresholds: ArbitrageBotThresholds;

  @Column({
    type: "jsonb",
    default: () => `'${JSON.stringify(DEFAULT_BOT_NOTIFICATIONS)}'::jsonb`,
  })
  notifications: ArbitrageBotNotificationConfig;

  // ── The capital behind it ────────────────────────────────────────────────

  /**
   * Frozen capital, one row per asset.
   *
   * Funding lives here rather than on the bot because a bot may hold several
   * assets at once — cash to buy first, the metal to sell first — and each
   * carries its own stop-loss.
   */
  @OneToMany(() => ArbitrageBotAllocationEntity, (allocation) => allocation.bot)
  allocations: ArbitrageBotAllocationEntity[];

  /** Default stop-loss applied to an allocation that does not set its own. */
  @Column({ type: "decimal", precision: 5, scale: 2, default: 100, name: "stop_loss_percent" })
  stopLossPercent: number;

  // ── Operational state ────────────────────────────────────────────────────

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ name: "stopped_at", type: "timestamptz", nullable: true })
  stoppedAt: Date | null;

  @Column({ name: "halted_at", type: "timestamptz", nullable: true })
  haltedAt: Date | null;

  @Column({ name: "halt_reason", type: "text", nullable: true })
  haltReason: string | null;

  @Column({ name: "last_signal_at", type: "timestamptz", nullable: true })
  lastSignalAt: Date | null;

  @Column({ name: "last_trade_at", type: "timestamptz", nullable: true })
  lastTradeAt: Date | null;

  @Column({ type: "int", default: 0, name: "matched_signals" })
  matchedSignals: number;

  /** Completed arbitrage cycles — one opportunity acted on. */
  @Column({ type: "int", default: 0, name: "total_trades" })
  totalTrades: number;

  /**
   * Provider orders placed. A cycle is never one order: it is a buy and a
   * sell, so this runs at twice `totalTrades` and is the number that matches
   * what the providers actually saw.
   */
  @Column({ type: "int", default: 0, name: "total_transactions" })
  totalTransactions: number;
}
