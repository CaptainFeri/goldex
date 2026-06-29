import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('provider_balances')
@Index(['providerKey', 'snapshotDate'], { unique: true })
@Index(['providerCategory'])
export class ProviderBalanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerKey: string;

  @Column()
  providerCategory: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  goldBalance: number;

  @Column({ nullable: true })
  goldUnit: string;

  @Column({ type: 'decimal', precision: 18, scale: 0, nullable: true })
  rialBalance: number;

  @Column({ nullable: true })
  rialUnit: string;

  @Column({ type: 'decimal', precision: 18, scale: 0, nullable: true })
  totalTaraz: number;

  @Column({ nullable: true })
  snapshotDate: string;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
