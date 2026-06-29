import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from "typeorm";

// Per-provider aggregate of COMPLETED (dealStatus=1) deals, mirrored from the
// pricing-engine over RabbitMQ (PROVIDER_DEALS_UPDATED). The provider_deals table
// itself lives in the engine's separate DB — we never query it directly.
@Entity("provider_deal_snapshots")
export class ProviderDealSnapshotEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "provider_key", unique: true })
  @Index()
  providerKey: string;

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
