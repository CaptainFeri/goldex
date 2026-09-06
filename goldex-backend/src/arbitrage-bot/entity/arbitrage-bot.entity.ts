import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { ManagerAccountEntity } from "../../manager-account/entity/manager-account.entity";
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
 * frozen out of its owner's manager account), and a notification policy.
 *
 * The frozen allocation is what makes the bot safe to run: it may keep trading
 * only while its realized losses stay under `stopLossAmount`, which is itself
 * capped by the allocation. When that budget is spent the bot halts itself and
 * waits for a person.
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

  @Column({ name: "manager_account_id", type: "uuid", nullable: true })
  managerAccountId: string | null;

  @ManyToOne(() => ManagerAccountEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "manager_account_id" })
  managerAccount: ManagerAccountEntity | null;

  /** Asset of the allocation; the same asset the bot's P&L is booked in. */
  @Column({ name: "symbol_id", type: "uuid", nullable: true })
  symbolId: string | null;

  @ManyToOne(() => SymbolEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity | null;

  /** Capital frozen out of the manager account for this bot. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "allocated_amount" })
  allocatedAmount: number;

  /** Share of the allocation the bot may lose before it halts. */
  @Column({ type: "decimal", precision: 5, scale: 2, default: 100, name: "stop_loss_percent" })
  stopLossPercent: number;

  /**
   * The loss budget in the allocation's asset — `allocatedAmount` times
   * `stopLossPercent`, stored so a later change to the allocation cannot
   * silently move the line a running bot is measured against.
   */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "stop_loss_amount" })
  stopLossAmount: number;

  /** Net realized result since the allocation was made; negative is a loss. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "realized_pnl" })
  realizedPnl: number;

  /** Cumulative realized losses, which is what the stop-loss measures. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "realized_loss" })
  realizedLoss: number;

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

  @Column({ type: "int", default: 0, name: "total_trades" })
  totalTrades: number;
}
