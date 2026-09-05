import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from "typeorm";

export enum SettlementDirection {
  // We physically RECEIVE an asset FROM the provider (reduces what they owe us).
  RECEIVE = "RECEIVE",
  // We PAY an asset TO the provider (reduces what we owe them).
  PAY = "PAY",
}

// Admin-recorded physical settlement with a provider. Each row offsets the
// running trading position (provider_deal_snapshots) toward zero. The remaining
// outstanding per (provider, symbol) is the un-settled bedehkar/bestankar.
@Entity("provider_settlements")
@Index(["providerKey", "symbol"])
export class ProviderSettlementEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "provider_key" })
  providerKey: string;

  @Column()
  symbol: string; // e.g. XAU, IRR

  @Column({ type: "enum", enum: SettlementDirection })
  direction: SettlementDirection;

  // Always a positive magnitude; the sign is derived from `direction`.
  @Column({ type: "decimal", precision: 24, scale: 8 })
  amount: number;

  @Column({ type: "varchar", nullable: true })
  note: string | null;

  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
