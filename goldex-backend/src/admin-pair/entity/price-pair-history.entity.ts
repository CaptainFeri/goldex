import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("price_pair_histories")
@Index(["pairId", "providerKey", "providerItemId"])
export class PricePairHistoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "pair_id", type: "uuid" })
  pairId: string;

  @Column({ name: "provider_key", length: 50 })
  providerKey: string;

  @Column({ name: "provider_item_id", type: "int" })
  providerItemId: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "buy_price" })
  buyPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "sell_price" })
  sellPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "buy_gram_price" })
  buyGramPrice: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true, name: "sell_gram_price" })
  sellGramPrice: number;

  @CreateDateColumn({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
