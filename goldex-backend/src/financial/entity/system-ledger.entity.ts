import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { SystemLedgerType } from "../enum/system-ledger-type.enum";

// The "system account" is the running aggregate of these ledger entries.
// Each row is one financial event the platform earned/adjusted, in a given
// asset (symbol). System balance per asset = SUM(amount) over its rows.
@Entity("system_ledger")
@Index(["symbolId", "createdAt"])
export class SystemLedgerEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "symbol_id", type: "uuid" })
  symbolId: string;

  @ManyToOne(() => SymbolEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "symbol_id" })
  symbol: SymbolEntity;

  @Column({ type: "enum", enum: SystemLedgerType })
  type: SystemLedgerType;

  // Positive = credit to the system (profit), negative = debit.
  @Column({ type: "decimal", precision: 20, scale: 8 })
  amount: number;

  @Column({ name: "order_id", type: "uuid", nullable: true })
  orderId: string;

  // The customer whose activity generated this entry (for attribution).
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string;

  // The provider whose deal produced this profit (per-provider profit views).
  @Column({ name: "provider_key", type: "varchar", nullable: true })
  providerKey: string;

  @Column({ type: "varchar", nullable: true })
  description: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
