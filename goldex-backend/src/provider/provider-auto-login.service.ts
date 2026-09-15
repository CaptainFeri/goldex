import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ProviderEntity } from './entity/provider.entity';
import { LoginAttemptService } from './login-attempt.service';
import { LoginAttemptOutcome } from './entity/provider-login-attempt.entity';

/**
 * The status the engine reports for a provider whose session was refused.
 *
 * It is what makes a provider a candidate for being logged in again: a
 * disconnected one is coming back on its own, and an inactive one was never
 * meant to be up.
 */
export const AUTH_EXPIRED_STATUS = 'auth_expired';

/**
 * How long one login attempt may hold a provider.
 *
 * Long enough for a code to arrive and be entered — the message is usually
 * seconds and occasionally a minute — and short enough that a handset that
 * dies mid-attempt does not hold the provider until somebody notices.
 */
const LEASE_TTL_SECONDS = 180;

/**
 * How long the record of recent attempts lives.
 *
 * Failures are consecutive failures, so the count has to forget: three spread
 * over three days is a provider with an intermittent problem, not one that
 * should stop being tried.
 */
const ATTEMPT_MEMORY_SECONDS = 6 * 60 * 60;

/** After this many consecutive failures, a person has to look at it. */
const MAX_CONSECUTIVE_ATTEMPTS = 3;

/** Attempts allowed in a day whatever the outcome, so a loop cannot hide in successes. */
const DAILY_ATTEMPT_CAP = 6;
const DAY_SECONDS = 24 * 60 * 60;

/** Minutes to wait after the first and second failure. */
const BACKOFF_MINUTES = [5, 15];

export type LeaseOutcome = 'success' | 'failure';

export interface LoginCandidate {
  id: string | null;
  key: string;
  persianName?: string | null;
  phone?: string | null;
  status: string;
  /** Whether a device may claim it right now. */
  eligible: boolean;
  /** Why not, when it may not. One line, meant to be shown. */
  reason: string | null;
  attempts: number;
  cooldownUntil: string | null;
  leasedBy: string | null;
}

interface AttemptRecord {
  count: number;
  cooldownUntil: string | null;
  lastAt: string;
}

interface Lease {
  deviceId: string;
  claimedAt: string;
}

/**
 * Who is allowed to log a provider back in, and how often anything may try.
 *
 * Automatic login is a loop pointed at somebody else's service. Every attempt
 * asks a provider to send a text message, and providers meter those and
 * suspend accounts that ask too often — so the limits are not a nicety around
 * the feature, they are the part that makes it safe to build at all, and they
 * live here rather than on the devices: a handset that reboots forgets how
 * many times it has tried, and two handsets never knew about each other.
 *
 * They bind automatic attempts only. A person at the panel is never held off
 * by a cooldown: the cap exists to stop an unattended loop, and a person who
 * decides to try again has made exactly the judgement it stands in for.
 */
@Injectable()
export class ProviderAutoLoginService {
  private readonly logger = new Logger(ProviderAutoLoginService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly attempts: LoginAttemptService,
  ) {}

  private leaseKey(key: string) {
    return `provider:autologin:lease:${key}`;
  }

  private attemptsKey(key: string) {
    return `provider:autologin:attempts:${key}`;
  }

  private dailyKey(key: string) {
    return `provider:autologin:daily:${key}`;
  }

  /**
   * Whether a device may try this provider now, and if not, why.
   *
   * The reason is returned rather than just a boolean because it is the whole
   * answer an operator needs: "waiting until 14:20" and "no phone number
   * stored" both mean no, and they call for completely different actions.
   *
   * @param awaitingProviderKey the provider a person is mid-activation on, if
   *   any — a code is single-use, so two requests mean both are wasted.
   */
  async describe(
    provider: ProviderEntity,
    awaitingProviderKey?: string | null,
  ): Promise<LoginCandidate> {
    const [record, lease, daily] = await Promise.all([
      this.readAttempts(provider.key),
      this.readLease(provider.key),
      this.redis.get(this.dailyKey(provider.key)),
    ]);

    const dailyCount = typeof daily === 'number' ? daily : Number(daily ?? 0);
    const base: LoginCandidate = {
      id: provider.id ?? null,
      key: provider.key,
      persianName: provider.persianName,
      phone: provider.phone,
      status: provider.status,
      eligible: false,
      reason: null,
      attempts: record.count,
      cooldownUntil: record.cooldownUntil,
      leasedBy: lease?.deviceId ?? null,
    };

    const reason = this.refusalReason(provider, record, lease, dailyCount, awaitingProviderKey);
    return { ...base, eligible: reason === null, reason };
  }

  private refusalReason(
    provider: ProviderEntity,
    record: AttemptRecord,
    lease: Lease | null,
    dailyCount: number,
    awaitingProviderKey?: string | null,
  ): string | null {
    if (!provider.id) return 'Provider is not registered in the admin mirror';
    if (provider.status !== AUTH_EXPIRED_STATUS) {
      return `Provider is ${provider.status}, not waiting for a login`;
    }
    if (!provider.sendOtpUrl?.trim() || !provider.verifyCodeUrl?.trim()) {
      return 'Provider has no OTP endpoints configured';
    }
    if (!provider.phone?.trim()) return 'Provider has no phone number stored';
    if (lease) return `Another device (${lease.deviceId}) is already trying`;
    if (awaitingProviderKey === provider.key) {
      return 'Someone is already activating this provider';
    }
    if (record.count >= MAX_CONSECUTIVE_ATTEMPTS) {
      return `Stopped after ${record.count} failed attempts; needs someone to look at it`;
    }
    if (dailyCount >= DAILY_ATTEMPT_CAP) {
      return `Daily limit of ${DAILY_ATTEMPT_CAP} attempts reached`;
    }
    if (record.cooldownUntil && new Date(record.cooldownUntil) > new Date()) {
      return `Waiting until ${record.cooldownUntil} after the last failed attempt`;
    }
    return null;
  }

  /**
   * Take the provider for one login attempt.
   *
   * The attempt is counted here, at the claim, rather than at the end. A
   * handset that is refused a code, or that loses power between asking for one
   * and using it, would otherwise leave nothing behind and be free to try
   * again immediately — which is the loop these limits exist to prevent. A
   * successful release clears the count; anything else leaves it standing.
   */
  async claim(
    provider: ProviderEntity,
    deviceId: string,
    awaitingProviderKey?: string | null,
    device?: { id: string; name: string } | null,
  ): Promise<{ leaseExpiresAt: string; phone: string }> {
    const described = await this.describe(provider, awaitingProviderKey);
    if (!described.eligible) {
      throw new ConflictException(described.reason ?? 'Provider cannot be logged in right now');
    }

    const claimed = await this.redis.setIfAbsent(
      this.leaseKey(provider.key),
      { deviceId, claimedAt: new Date().toISOString() } satisfies Lease,
      LEASE_TTL_SECONDS,
    );
    // Two devices asking at the same moment both pass the check above; only one
    // passes this, which is why the check is not what grants it.
    if (!claimed) throw new ConflictException('Another device claimed this provider first');

    const record = await this.readAttempts(provider.key);
    const count = record.count + 1;
    await Promise.all([
      this.writeAttempts(provider.key, {
        count,
        cooldownUntil: this.cooldownFor(count),
        lastAt: new Date().toISOString(),
      }),
      this.redis.incrementWithExpiry(this.dailyKey(provider.key), DAY_SECONDS),
    ]);

    await this.attempts.started(provider.key, count, device);

    this.logger.log(`Device ${deviceId} claimed ${provider.key} for login attempt ${count}`);
    return {
      leaseExpiresAt: new Date(Date.now() + LEASE_TTL_SECONDS * 1000).toISOString(),
      phone: provider.phone as string,
    };
  }

  /**
   * Refuse anything but the device that holds the claim.
   *
   * Without this the lease would be advisory: a device could skip claiming and
   * go straight to asking the provider for a code, which is exactly the
   * unmetered loop the lease exists to prevent, and two devices could drive one
   * activation into spending both its codes.
   */
  async assertHolder(providerKey: string, deviceId: string): Promise<void> {
    const lease = await this.readLease(providerKey);
    if (!lease) {
      throw new ConflictException(
        `No login attempt is in progress for ${providerKey}; claim it first`,
      );
    }
    if (lease.deviceId !== deviceId) {
      throw new ConflictException(`This attempt belongs to device ${lease.deviceId}`);
    }
  }

  /** Give the provider back, saying whether the login worked. */
  async release(
    provider: ProviderEntity,
    deviceId: string,
    outcome: LeaseOutcome,
    reason?: string | null,
  ): Promise<{ message: string }> {
    const lease = await this.readLease(provider.key);
    if (!lease) throw new BadRequestException('No login attempt is in progress for this provider');
    if (lease.deviceId !== deviceId) {
      // Releasing somebody else's attempt would free the provider for a third
      // device while the second is still waiting for its code.
      throw new ConflictException(`This attempt belongs to device ${lease.deviceId}`);
    }

    await this.redis.del(this.leaseKey(provider.key));
    if (outcome === 'success') {
      await this.clearAttempts(provider.key);
      await this.attempts.finished(provider.key, LoginAttemptOutcome.SUCCEEDED);
      this.logger.log(`Device ${deviceId} logged ${provider.key} back in`);
      return { message: `Provider ${provider.key} logged in by ${deviceId}` };
    }

    await this.attempts.finished(provider.key, LoginAttemptOutcome.FAILED, reason);

    // The moment the automatic system gives up. Without saying so here it is
    // invisible: the handset simply stops trying and the provider stays down
    // until somebody wonders why a price is missing.
    const record = await this.readAttempts(provider.key);
    if (record.count >= MAX_CONSECUTIVE_ATTEMPTS) {
      await this.attempts.announceExhausted(provider.key, record.count, reason);
    }

    this.logger.warn(`Device ${deviceId} failed to log ${provider.key} in`);
    return { message: `Attempt on ${provider.key} recorded as failed` };
  }

  /**
   * The provider is working again, however that happened.
   *
   * A person activating it from the panel settles the same question the
   * automatic attempts were failing to settle, so the count of those failures
   * has nothing left to describe.
   */
  async noteActivated(providerKey: string): Promise<void> {
    await Promise.all([
      this.clearAttempts(providerKey),
      this.redis.del(this.leaseKey(providerKey)),
      // Closes whatever a device left open. A person fixing it by hand is the
      // end of that attempt too, and leaving it "started" forever would make
      // the record read as though a handset were still working on it.
      this.attempts.finished(providerKey, LoginAttemptOutcome.SUCCEEDED, 'activated by hand'),
    ]);
  }

  /** null while there is no cooldown left to serve, otherwise when it ends. */
  private cooldownFor(attemptCount: number): string | null {
    const minutes = BACKOFF_MINUTES[attemptCount - 1];
    if (minutes === undefined) return null;
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  /** The attempt in progress, if one is. */
  private async readLease(key: string): Promise<Lease | null> {
    const stored = await this.redis.get(this.leaseKey(key));
    if (!stored?.deviceId) return null;
    return { deviceId: stored.deviceId, claimedAt: stored.claimedAt ?? '' };
  }

  private async readAttempts(key: string): Promise<AttemptRecord> {
    const stored = await this.redis.get(this.attemptsKey(key));
    if (!stored || typeof stored.count !== 'number') {
      return { count: 0, cooldownUntil: null, lastAt: '' };
    }
    return {
      count: stored.count,
      cooldownUntil: stored.cooldownUntil ?? null,
      lastAt: stored.lastAt ?? '',
    };
  }

  private async writeAttempts(key: string, record: AttemptRecord): Promise<void> {
    await this.redis.setWithExpiration(this.attemptsKey(key), record, ATTEMPT_MEMORY_SECONDS);
  }

  private async clearAttempts(key: string): Promise<void> {
    await this.redis.del(this.attemptsKey(key));
  }
}
