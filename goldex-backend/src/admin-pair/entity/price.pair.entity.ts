import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { Entity, Column, ManyToOne, JoinColumn, Index, ManyToMany } from "typeorm";
import { UserLevelEntity } from "../../user-level/entity/user-level.entity";

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

  @ManyToMany(() => UserLevelEntity, (l) => l.pairs)
  levels: UserLevelEntity[];
}
