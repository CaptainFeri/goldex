import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PricePairEntity } from '../../admin-pair/entity/price.pair.entity';

export enum MarketPoolType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  QUOTE = 'QUOTE',
}

export enum MarketStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Per-price-pair, per-pool (MARKET / LIMIT / QUOTE) market status.
 * `derivedStatus` is computed automatically (MARKET from provider price
 * presence; LIMIT/QUOTE default OPEN). `adminOverride` lets an admin force a
 * status. `effectiveStatus` is the override if set, otherwise the derived one.
 */
@Entity('pair_pool_status')
export class PairPoolStatusEntity {
  @PrimaryColumn({ name: 'pair_id', type: 'uuid' })
  pairId: string;

  @ManyToOne(() => PricePairEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pair_id' })
  pair: PricePairEntity;

  @PrimaryColumn({ name: 'pool_type', length: 20 })
  poolType: MarketPoolType;

  @Column({ name: 'derived_status', length: 20 })
  derivedStatus: MarketStatus;

  @Column({ name: 'admin_override', length: 20, nullable: true })
  adminOverride: MarketStatus | null;

  @Column({ name: 'effective_status', length: 20 })
  effectiveStatus: MarketStatus;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt?: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt?: Date;
}
