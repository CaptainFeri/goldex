import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn, Index } from "typeorm";

// Latest balance per provider, mirrored from the pricing-engine over RabbitMQ
// (the provider_balances table lives in the engine's separate DB).
@Entity("provider_balance_snapshots")
export class ProviderBalanceSnapshotEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "provider_key", unique: true })
  @Index()
  providerKey: string;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "gold_balance" })
  goldBalance: number;

  @Column({ type: "decimal", precision: 20, scale: 2, nullable: true, name: "rial_balance" })
  rialBalance: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
