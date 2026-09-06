import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ArbitrageBotEntity } from "./arbitrage-bot.entity";
import { ArbitrageBotTradeStatusEnum } from "../enum/arbitrage-bot.enums";

/**
 * One opportunity a bot acted on, from the signal that triggered it to the
 * result that was booked against its allocation.
 *
 * The signal's prices are copied in rather than referenced: quotes expire in
 * seconds, and a settled trade has to stay explainable long after the
 * opportunity that produced it is gone.
 */
@Entity("arbitrage_bot_trade")
@Index(["botId", "status"])
@Index(["botId", "createAt"])
export class ArbitrageBotTradeEntity extends myBaseEntity {
  @Column({ name: "bot_id", type: "uuid" })
  botId: string;

  @ManyToOne(() => ArbitrageBotEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: ArbitrageBotEntity;

  /** The engine's stable key for the opportunity (item + provider pair). */
  @Column({ name: "signal_key", type: "varchar", length: 200 })
  @Index()
  signalKey: string;

  @Column({ name: "signal_id", type: "varchar", length: 100, nullable: true })
  signalId: string | null;

  @Column({ name: "item_id", type: "int", nullable: true })
  itemId: number | null;

  @Column({ name: "item_name", type: "varchar", length: 200, nullable: true })
  itemName: string | null;

  @Column({ name: "buy_provider_key", type: "varchar", length: 100 })
  buyProviderKey: string;

  @Column({ name: "sell_provider_key", type: "varchar", length: 100 })
  sellProviderKey: string;

  /** Rial price the bot buys at (the cheap provider's ask). */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "buy_price" })
  buyPrice: number;

  /** Rial price the bot sells at (the dear provider's bid). */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "sell_price" })
  sellPrice: number;

  /** Position size in the allocation's asset. */
  @Column({ type: "decimal", precision: 20, scale: 8 })
  volume: number;

  /** Profit the signal promised for this size, in Rial. */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "expected_profit_rial" })
  expectedProfitRial: number;

  /** Profit actually booked, in Rial. Null until the trade settles. */
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "realized_profit_rial" })
  realizedProfitRial: number | null;

  /** The same result in the allocation's asset, which is what the budget is in. */
  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "realized_pnl_asset" })
  realizedPnlAsset: number | null;

  @Column({
    type: "varchar",
    length: 20,
    default: ArbitrageBotTradeStatusEnum.PLANNED,
  })
  status: ArbitrageBotTradeStatusEnum;

  /** Per-leg execution state, keyed by the client order id sent to the engine. */
  @Column({ type: "jsonb", nullable: true })
  legs: Record<string, any> | null;

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt: Date | null;

  @Column({ name: "settled_at", type: "timestamptz", nullable: true })
  settledAt: Date | null;

  @Column({ name: "failure_reason", type: "text", nullable: true })
  failureReason: string | null;

  /** The full signal as received, for reconstructing the decision later. */
  @Column({ type: "jsonb", nullable: true })
  signal: Record<string, any> | null;
}
