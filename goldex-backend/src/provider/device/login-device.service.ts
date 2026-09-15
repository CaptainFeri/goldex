import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ProviderLoginDeviceEntity } from '../entity/provider-login-device.entity';

/** Marks the secret as ours, so one found in a log is recognisable for what it is. */
const TOKEN_PREFIX = 'gxd_';

/**
 * How long a device may go unseen before its last contact stops being written.
 *
 * Every authenticated request could update `last_seen_at`, but a device polling
 * every thirty seconds would then write to the row constantly to record
 * something nobody needs to the second.
 */
const LAST_SEEN_WRITE_INTERVAL_MS = 60_000;

/**
 * Enrolling, recognising and revoking the handsets trusted to log providers in.
 *
 * The secret is shown exactly once, at enrolment. There is no "show me the
 * token again": only its hash is kept, so the answer to a lost token is a new
 * device, which is also the answer that leaves a revoked credential behind
 * rather than a shared one.
 */
@Injectable()
export class LoginDeviceService {
  private readonly logger = new Logger(LoginDeviceService.name);

  constructor(
    @InjectRepository(ProviderLoginDeviceEntity)
    private readonly devices: Repository<ProviderLoginDeviceEntity>,
  ) {}

  /**
   * A new device credential.
   *
   * @returns the row and the secret, which the caller must pass on immediately
   *   — it cannot be recovered afterwards.
   */
  async enroll(
    name: string,
    createdByAdminId?: string,
  ): Promise<{ device: ProviderLoginDeviceEntity; token: string }> {
    // 256 bits from the system CSPRNG. The point of the size is that the token
    // needs no rate limiting to be unguessable.
    const secret = randomBytes(32).toString('base64url');
    const token = `${TOKEN_PREFIX}${secret}`;

    const device = await this.devices.save(
      this.devices.create({
        name: name.trim(),
        tokenHash: hashToken(token),
        createdByAdminId: createdByAdminId ?? null,
      }),
    );

    this.logger.log(`Enrolled provider-login device "${device.name}" (${device.id})`);
    return { device, token };
  }

  async list(): Promise<ProviderLoginDeviceEntity[]> {
    return this.devices.find({ order: { createAt: 'DESC' } });
  }

  /**
   * Withdraw trust from a device.
   *
   * The row stays: it is the record that this device existed and acted, and
   * that record has to outlive the trust — otherwise revoking a handset also
   * erases the history of what it did.
   */
  async revoke(id: string): Promise<ProviderLoginDeviceEntity> {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) throw new NotFoundException('No such device');
    if (device.revokedAt) return device;

    device.revokedAt = new Date();
    const saved = await this.devices.save(device);
    this.logger.warn(`Revoked provider-login device "${device.name}" (${device.id})`);
    return saved;
  }

  /**
   * The device this token belongs to, or null.
   *
   * Looked up by hash rather than compared row by row: the unique index makes
   * it one indexed read, and nothing in the table has to be examined by a
   * caller holding the wrong token.
   */
  async authenticate(presented: string | undefined): Promise<ProviderLoginDeviceEntity | null> {
    if (!presented?.startsWith(TOKEN_PREFIX)) return null;

    const device = await this.devices.findOne({
      where: { tokenHash: hashToken(presented), revokedAt: IsNull() },
    });
    if (!device) return null;

    // The lookup already proved the hashes equal, but comparing them again in
    // constant time costs nothing and keeps the equality check off the code
    // path's timing regardless of how the query layer behaves.
    if (!sameHash(device.tokenHash, hashToken(presented))) return null;

    await this.touch(device);
    return device;
  }

  private async touch(device: ProviderLoginDeviceEntity): Promise<void> {
    const last = device.lastSeenAt?.getTime() ?? 0;
    if (Date.now() - last < LAST_SEEN_WRITE_INTERVAL_MS) return;
    device.lastSeenAt = new Date();
    await this.devices.update({ id: device.id }, { lastSeenAt: device.lastSeenAt });
  }
}

/** SHA-256, hex. Enough to recognise a 256-bit random secret, not enough to undo it. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
