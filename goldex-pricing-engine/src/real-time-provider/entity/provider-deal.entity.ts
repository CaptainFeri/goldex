import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('provider_deals')
@Index(['providerKey', 'orderId'], { unique: true })
@Index(['providerKey', 'orderDate'])
@Index(['providerCategory'])
export class ProviderDealEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  providerKey: string;

  @Column()
  providerCategory: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  orderCode: string;

  @Column({ type: 'int', nullable: true })
  factorCode: number;

  @Column({ nullable: true })
  itemName: string;

  @Column({ type: 'int', nullable: true })
  itemId: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  count: number;

  @Column({ type: 'decimal', precision: 18, scale: 0, nullable: true })
  totalPrice: number;

  // Pure/real price we place the order at with the provider (no markup).
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  inputPrice: number;

  // Customer-shown price (pure + commission + gain), per MESGHAL and per GRAM.
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  customerPrice: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  customerGramPrice: number;

  // Customer-facing GRAM volume + per-gram price (the provider deals in mesghal).
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  gramVolume: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  gramPrice: number;

  // The order price expressed per MESGHAL.
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  mesghalPrice: number;

  // Price the order actually filled at (set when the deal resolves to success).
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  filledPrice: number;

  @Column({ type: 'int', nullable: true })
  dealType: number;

  @Column({ nullable: true })
  dealTypeStr: string;

  @Column({ type: 'int', nullable: true })
  dealStatus: number;

  @Column({ nullable: true })
  orderStatusStr: string;

  @Column({ type: 'decimal', precision: 18, scale: 0, nullable: true })
  mazane: number;

  @Column({ nullable: true })
  mazaneStr: string;

  @Column({ type: 'timestamp', nullable: true })
  orderDate: Date;

  @Column({ nullable: true })
  orderDateStr: string;

  @Column({ type: 'int', nullable: true })
  carat: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  weight750: number;

  @Column({ type: 'jsonb', nullable: true })
  rawData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
