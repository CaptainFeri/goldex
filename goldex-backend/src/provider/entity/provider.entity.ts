import { myBaseEntity } from '../../shared/entity/base.entity';
import { Entity, Column, Index } from 'typeorm';

/**
 * Admin-facing mirror of a pricing-engine provider. The pricing-engine owns the
 * authoritative `providers` table and the runtime lifecycle; this entity is kept
 * in sync via RabbitMQ events published back from the engine. Runtime `status`
 * is derived from those events (connected / connecting / disconnected /
 * stopped / inactive / error).
 */
@Entity('provider')
export class ProviderEntity extends myBaseEntity {
  @Column({ unique: true, length: 100 })
  key: string;

  @Column({ length: 50 })
  category: string;

  @Column({ type: 'text' })
  baseUrl: string;

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

  @Column({ type: 'jsonb', default: {} })
  auth?: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  config?: Record<string, any>;

  @Column({ default: false })
  active: boolean;

  @Column({ type: 'int', default: 60000 })
  metadataRefreshIntervalMs: number;

  /** Runtime connection state reported by the engine (not a DB driver column). */
  @Column({ length: 30, default: 'inactive' })
  @Index()
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastStatusChangeAt?: Date;
}
