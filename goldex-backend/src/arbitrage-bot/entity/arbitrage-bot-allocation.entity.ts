import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ArbitrageBotEntity } from "./arbitrage-bot.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { ManagerAccountEntity } from "../../manager-account/entity/manager-account.entity";

/**
 * Capital frozen into one bot, in one asset.
 *
 * A bot needs a separate row per asset because a manager account holds one
 * asset each, and because the two sides of an arbitrage are paid in different
 * things: cash funds a buy-first cycle, the metal funds a sell-first one. A
 * bot given 10g of gold and 100bn Rial can therefore take either direction,
 * and each side carries its own stop-loss — a gold loss must not be excused
 * by a Rial budget it has nothing to do with.
 */
@Entity("arbitrage_bot_allocation")
@Unique("uq_bot_allocation_asset", ["botId", "symbolId"])
@Index(["botId"])
export class ArbitrageBotAllocationEntity extends myBaseEntity {
  @Column({ name: "bot_id", type: "uuid" })
  botId: string;

  @ManyToOne(() => ArbitrageBotEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: ArbitrageBotEntity;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  /** The owner's account this capital was frozen out of. */
  @Column({ name: "manager_account_id", type: "uuid" })
  managerAccountId: string;

  @ManyToOne(() => ManagerAccountEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "manager_account_id" })
  managerAccount: ManagerAccountEntity;

  /** Frozen amount, in the asset's own unit. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "allocated_amount" })
  allocatedAmount: number;

  /** Share of this asset's allocation the bot may lose before it stops using it. */
  @Column({ type: "decimal", precision: 5, scale: 2, default: 100, name: "stop_loss_percent" })
  stopLossPercent: number;

  /**
   * The loss budget in this asset — `allocatedAmount` times `stopLossPercent`,
   * stored so a later change to the allocation cannot silently move the line a
   * running bot is measured against.
   */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "stop_loss_amount" })
  stopLossAmount: number;

  /** Net realized result booked against this asset; negative is a loss. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "realized_pnl" })
  realizedPnl: number;

  /** Cumulative realized losses in this asset, which is what its budget measures. */
  @Column({ type: "decimal", precision: 20, scale: 8, default: 0, name: "realized_loss" })
  realizedLoss: number;
}
