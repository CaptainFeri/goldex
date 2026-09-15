import { Entity, Column, Index } from 'typeorm';
import { myBaseEntity } from '../../shared/entity/base.entity';

export enum LoginAttemptOutcome {
  /** Claimed, still in progress — or abandoned by a device that never came back. */
  STARTED = 'started',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
}

/**
 * One attempt to log a provider back in.
 *
 * Automatic activation happens with nobody watching, so the only account of it
 * is the one it writes down. The Redis counters that decide whether another
 * attempt is allowed are not that account: they are deliberately short-lived —
 * they forget after six hours so an old failure stops holding a provider back —
 * and a record that forgets cannot answer "why was this provider down all
 * night".
 *
 * A row is written when an attempt starts rather than when it ends, because the
 * attempts worth investigating are exactly the ones that never ended.
 */
@Entity('provider_login_attempt')
export class ProviderLoginAttemptEntity extends myBaseEntity {
  @Column({ length: 100, name: 'provider_key' })
  @Index()
  providerKey: string;

  /**
   * The device that made the attempt, or null when a person did it from the
   * panel. Kept as a name rather than a reference so revoking the device does
   * not make its history unreadable.
   */
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'device_name' })
  deviceName?: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'device_id' })
  deviceId?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: LoginAttemptOutcome.STARTED,
  })
  @Index()
  outcome: LoginAttemptOutcome;

  /** Why it failed, in the words the provider or the engine used. */
  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'finished_at' })
  finishedAt?: Date | null;

  /** Which attempt in the run of consecutive failures this was. */
  @Column({ type: 'int', default: 1 })
  attempt: number;
}
