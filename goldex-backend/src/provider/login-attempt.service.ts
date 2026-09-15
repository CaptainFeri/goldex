import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LoginAttemptOutcome,
  ProviderLoginAttemptEntity,
} from './entity/provider-login-attempt.entity';
import { AdminNotificationGateway } from '../notification/admin-notification.gateway';

/** How many recent attempts a feed shows unless asked for fewer. */
const DEFAULT_FEED_SIZE = 20;

/**
 * The account of what the unattended system did.
 *
 * Automatic activation happens with nobody watching, which makes the record of
 * it the only thing anyone can look at afterwards — and makes the alarm at the
 * end of it the only way anyone finds out in time.
 *
 * Deliberately separate from the Redis counters in `ProviderAutoLoginService`.
 * Those decide whether another attempt is allowed and forget after six hours so
 * that an old failure stops holding a provider back. Forgetting is right for a
 * governor and wrong for a record: "why was this provider down all night" is
 * asked in the morning.
 */
@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);

  constructor(
    @InjectRepository(ProviderLoginAttemptEntity)
    private readonly attempts: Repository<ProviderLoginAttemptEntity>,
    private readonly adminNotifications: AdminNotificationGateway,
  ) {}

  /**
   * Written when the attempt starts, not when it finishes.
   *
   * The attempts worth investigating are the ones that never finished — a
   * handset that lost power between asking for a code and using it leaves
   * nothing behind otherwise, and an operator sees a provider that was never
   * tried rather than one whose phone died.
   */
  async started(
    providerKey: string,
    attempt: number,
    device?: { id: string; name: string } | null,
  ): Promise<ProviderLoginAttemptEntity> {
    return this.attempts.save(
      this.attempts.create({
        providerKey,
        attempt,
        deviceId: device?.id ?? null,
        deviceName: device?.name ?? null,
        outcome: LoginAttemptOutcome.STARTED,
      }),
    );
  }

  /** Close the most recent open attempt for this provider. */
  async finished(
    providerKey: string,
    outcome: LoginAttemptOutcome,
    reason?: string | null,
  ): Promise<void> {
    const open = await this.attempts.findOne({
      where: { providerKey, outcome: LoginAttemptOutcome.STARTED },
      order: { createAt: 'DESC' },
    });
    // No open attempt is not an error: a provider activated from the panel was
    // never claimed, and there is nothing to close.
    if (!open) return;

    open.outcome = outcome;
    open.reason = reason ?? null;
    open.finishedAt = new Date();
    await this.attempts.save(open);
  }

  /** The most recent attempts, newest first. */
  async recent(providerKey?: string, limit = DEFAULT_FEED_SIZE): Promise<ProviderLoginAttemptEntity[]> {
    return this.attempts.find({
      where: providerKey ? { providerKey } : {},
      order: { createAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Tell the operators that a provider has stopped being retried.
   *
   * This is the moment the automatic system gives up, and without it that
   * moment is invisible: the handset simply stops trying, the provider stays
   * down, and the next person to notice is whoever wonders why a price is
   * missing. Announced once, when the cap is reached, rather than on every
   * refused attempt — an alert that arrives every minute is one nobody reads.
   */
  async announceExhausted(providerKey: string, attempts: number, reason?: string | null): Promise<void> {
    this.logger.error(
      `Provider ${providerKey} gave up after ${attempts} failed automatic logins: ${reason ?? 'no reason recorded'}`,
    );
    try {
      this.adminNotifications.sendToAdmins({
        event: 'provider.login.exhausted',
        title: 'ورود خودکار متوقف شد',
        body:
          `«${providerKey}» پس از ${attempts} تلاش ناموفق دیگر به‌صورت خودکار تلاش نمی‌شود؛ ` +
          `باید دستی بررسی شود.`,
        type: 'error',
        metadata: { providerKey, attempts, reason: reason ?? null },
      });
    } catch (err) {
      // A failed alert must not fail the attempt that raised it: the provider
      // is already down and losing the record as well would be worse.
      this.logger.warn(`could not announce exhaustion for ${providerKey}: ${(err as Error).message}`);
    }
  }
}
