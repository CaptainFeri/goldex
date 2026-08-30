import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from "typeorm";

// Per-provider, per-item aggregate of COMPLETED (dealStatus=1) deals, mirrored
// from the pricing-engine over RabbitMQ (PROVIDER_DEALS_UPDATED). The
// provider_deals table itself lives in the engine's separate DB — we never
// query it directly. Each row carries the pair symbols resolved from the
// provider-pair mapping so balances are attributed to the real base/quote
// pair instead of assuming XAU/IRR.
@Entity("provider_deal_snapshots")
@Index(["providerKey", "itemId"], { unique: true })
export class ProviderDealSnapshotEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "provider_key" })
  @Index()
  providerKey: string;

  // Provider-side item the deals were executed against (resolves to a pair).
  @Column({ type: "int", nullable: true, name: "item_id" })
  itemId: number | null;

  // Resolved pair symbols for this item.
  @Column({ type: "varchar", length: 20, nullable: true, name: "base_symbol" })
  baseSymbol: string | null;

  @Column({ type: "varchar", length: 20, nullable: true, name: "quote_symbol" })
  quoteSymbol: string | null;

  @Column({ type: "int", default: 0, name: "deal_count" })
  dealCount: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0, name: "total_volume" })
  totalVolume: number;

  @Column({ type: "decimal", precision: 24, scale: 2, default: 0, name: "total_value" })
  totalValue: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0, name: "buy_volume" })
  buyVolume: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0, name: "sell_volume" })
  sellVolume: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0, name: "net_volume" })
  netVolume: number;

  @Column({ type: "decimal", precision: 24, scale: 2, default: 0, name: "buy_value" })
  buyValue: number;

  @Column({ type: "decimal", precision: 24, scale: 2, default: 0, name: "sell_value" })
  sellValue: number;

  @Column({ type: "decimal", precision: 24, scale: 2, default: 0, name: "net_value" })
  netValue: number;

  @Column({ type: "timestamptz", nullable: true, name: "last_deal_at" })
  lastDealAt: Date | null;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
