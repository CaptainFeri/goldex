import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CurrencyUnit, DEFAULT_PROVIDER_PRICE_UNIT } from '../../common/currency-unit';

@Entity('providers')
export class ProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'text' })
  baseUrl!: string;

  @Column({ type: 'text', nullable: true })
  apiBaseUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  persianName?: string;

  @Column({ type: 'text', nullable: true })
  webPanelUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  sendOtpUrl?: string;

  @Column({ type: 'text', nullable: true })
  verifyCodeUrl?: string;

  /**
   * Unit this provider quotes in. Rial and Toman differ by a factor of ten, so
   * a wrong reading here is a 10x pricing error — the engine converts every
   * incoming quote to Rial using this before anything else sees it.
   */
  @Column({ type: 'varchar', length: 10, default: DEFAULT_PROVIDER_PRICE_UNIT })
  priceUnit!: CurrencyUnit;

  @Column({ type: 'jsonb', default: {} })
  auth!: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, any>;

  /**
   * Whether this provider's traffic is tunnelled through the configured proxy.
   *
   * Declared when the provider is defined, because reachability is a fact about
   * the provider: the Iranian ones answer only to an egress inside Iran. Covers
   * everything the engine says to it — OTP, REST and the price socket alike.
   * Defaults on, which is how every provider was reached before the flag.
   */
  @Column({ type: 'boolean', default: true, name: 'use_proxy' })
  useProxy!: boolean;

  @Column({ default: false })
  active!: boolean;

  @Column({ type: 'int', default: 60000 })
  metadataRefreshIntervalMs!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
