import { Entity, Column, Index } from 'typeorm';
import { myBaseEntity } from '../../shared/entity/base.entity';

/**
 * A handset trusted to log providers back in on its own.
 *
 * It exists so that such a handset does not have to carry an admin session.
 * An admin token opens the whole platform, and a phone left on a desk to work
 * unattended for weeks is the worst place to keep one — it cannot be revoked
 * without locking out the person it belongs to, and it grants everything when
 * what is needed is four endpoints.
 *
 * The secret itself is never stored. What is kept is a SHA-256 of it, which is
 * enough to recognise the token on a later request and not enough to
 * reconstruct it from a database dump. No work factor is involved because the
 * secret is 256 bits of randomness rather than a password: there is nothing to
 * guess, so there is nothing for a slow hash to slow down.
 */
@Entity('provider_login_device')
export class ProviderLoginDeviceEntity extends myBaseEntity {
  /** What a person calls it, so a revoke can be aimed at the right phone. */
  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'token_hash' })
  @Index()
  tokenHash: string;

  /**
   * When it last presented its credential.
   *
   * The one thing that says whether a device left to work unattended is still
   * alive. A handset killed by a battery optimiser fails silently, and this is
   * where that shows.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'last_seen_at' })
  lastSeenAt?: Date | null;

  /**
   * Revoked rather than deleted: the row is the record that this device
   * existed and acted, and that record outlives the trust.
   */
  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revokedAt?: Date | null;

  /** Which admin enrolled it. */
  @Column({ type: 'uuid', nullable: true, name: 'created_by_admin_id' })
  createdByAdminId?: string | null;

  get active(): boolean {
    return !this.revokedAt;
  }
}
