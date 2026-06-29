import { PricePairEntity } from '../../admin-pair/entity/price.pair.entity';
import { myBaseEntity } from '../../shared/entity/base.entity';
import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('provider_pair_mappings')
@Unique(['pairId', 'providerKey', 'providerItemId'])
export class ProviderPairMappingEntity extends myBaseEntity {
  @Column({ name: 'pair_id', type: 'uuid' })
  pairId: string;

  @ManyToOne(() => PricePairEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pair_id' })
  pair: PricePairEntity;

  @Column({ name: 'provider_key', length: 50 })
  providerKey: string;

  @Column({ name: 'provider_item_id', type: 'int' })
  providerItemId: number;

  @Column({ name: 'use_buy_price', default: true })
  useBuyPrice: boolean;

  @Column({ name: 'use_sell_price', default: true })
  useSellPrice: boolean;
}
