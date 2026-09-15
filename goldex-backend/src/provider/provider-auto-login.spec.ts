import { ProviderAutoLoginService } from './provider-auto-login.service';
import { ProviderEntity } from './entity/provider.entity';

/**
 * The limits on logging a provider back in without a person.
 *
 * Every attempt asks somebody else's service to send a text message, and
 * providers meter those and suspend accounts that ask too often. So these are
 * not a nicety around the feature — they are the reason it is safe to have
 * one. The tests that matter most here are the ones where the answer is no.
 */
describe('claiming a provider for an automatic login', () => {
  const provider = (over: Partial<ProviderEntity> = {}): ProviderEntity =>
    ({
      id: 'p-1',
      key: 'zaryar',
      status: 'auth_expired',
      phone: '09123456789',
      sendOtpUrl: 'https://example.ir/send',
      verifyCodeUrl: 'https://example.ir/verify',
      ...over,
    }) as ProviderEntity;

  /** A Redis that behaves like one, so the NX claim really is a race. */
  const build = () => {
    const store = new Map<string, any>();
    const redis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      setWithExpiration: jest.fn((key: string, value: any) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      setIfAbsent: jest.fn((key: string, value: any) => {
        if (store.has(key)) return Promise.resolve(false);
        store.set(key, value);
        return Promise.resolve(true);
      }),
      incrementWithExpiry: jest.fn((key: string) => {
        const next = (Number(store.get(key)) || 0) + 1;
        store.set(key, next);
        return Promise.resolve(next);
      }),
      del: jest.fn((key: string) => Promise.resolve(store.delete(key))),
    };
    return { service: new ProviderAutoLoginService(redis as any), store, redis };
  };

  describe('what makes a provider a candidate at all', () => {
    it('one the engine says has stopped accepting its session', async () => {
      const { service } = build();
      const described = await service.describe(provider());
      expect(described.eligible).toBe(true);
      expect(described.reason).toBeNull();
    });

    // A disconnected provider is coming back on its own; logging it in would
    // spend a code on a problem that is already being solved.
    it('but not one that is merely disconnected', async () => {
      const { service } = build();
      const described = await service.describe(provider({ status: 'disconnected' }));
      expect(described.eligible).toBe(false);
      expect(described.reason).toMatch(/disconnected/);
    });

    it('not one whose login this path cannot drive', async () => {
      const { service } = build();
      const described = await service.describe(provider({ sendOtpUrl: '   ' }));
      expect(described.reason).toMatch(/OTP endpoints/);
    });

    it('not one with no number to send a code to', async () => {
      const { service } = build();
      const described = await service.describe(provider({ phone: null }));
      expect(described.reason).toMatch(/phone/i);
    });

    it('not one the mirror cannot address', async () => {
      const { service } = build();
      const described = await service.describe(provider({ id: undefined }));
      expect(described.reason).toMatch(/not registered/);
    });
  });

  describe('one attempt at a time', () => {
    it('is held by the device that claimed it', async () => {
      const { service } = build();
      const claim = await service.claim(provider(), 'phone-1');
      expect(claim.phone).toBe('09123456789');
      expect(Date.parse(claim.leaseExpiresAt)).toBeGreaterThan(Date.now());
    });

    /**
     * Both devices pass the eligibility check — it is the claim itself that
     * decides, which is why the check is not what grants it.
     */
    it('is refused to a second device', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await expect(service.claim(provider(), 'phone-2')).rejects.toThrow(/phone-1/);
    });

    it('says who holds it', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      const described = await service.describe(provider());
      expect(described.leasedBy).toBe('phone-1');
    });

    it('cannot be given back by a device that does not hold it', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await expect(service.release(provider(), 'phone-2', 'success')).rejects.toThrow(/phone-1/);
    });

    it('cannot be given back when nothing is in progress', async () => {
      const { service } = build();
      await expect(service.release(provider(), 'phone-1', 'success')).rejects.toThrow(/no login/i);
    });
  });

  /**
   * Without this the lease would be advisory. A device could skip claiming and
   * go straight to asking the provider for a code — the unmetered loop the
   * lease exists to prevent — and two devices could drive one activation into
   * spending both its codes.
   */
  describe('only the holder may act', () => {
    it('lets the device that claimed it through', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await expect(service.assertHolder('zaryar', 'phone-1')).resolves.toBeUndefined();
    });

    it('refuses a device that never claimed it', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await expect(service.assertHolder('zaryar', 'phone-2')).rejects.toThrow(/phone-1/);
    });

    it('refuses acting with no claim at all', async () => {
      const { service } = build();
      await expect(service.assertHolder('zaryar', 'phone-1')).rejects.toThrow(/claim it first/);
    });

    it('refuses once the claim has been given back', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'failure');
      await expect(service.assertHolder('zaryar', 'phone-1')).rejects.toThrow(/claim it first/);
    });
  });

  describe('a person at the panel comes first', () => {
    // The code is single-use. Two requests for one activation mean both are
    // spent and neither works.
    it('holds the devices off while somebody is activating it', async () => {
      const { service } = build();
      const described = await service.describe(provider(), 'zaryar');
      expect(described.eligible).toBe(false);
      expect(described.reason).toMatch(/already activating/);
    });

    it('but not while they are activating a different provider', async () => {
      const { service } = build();
      const described = await service.describe(provider(), 'talaab');
      expect(described.eligible).toBe(true);
    });
  });

  describe('how often anything may try', () => {
    /**
     * Counted at the claim rather than at the end. A handset that loses power
     * between asking for a code and using it leaves nothing behind otherwise,
     * and is free to ask again immediately — which is the loop being prevented.
     */
    it('counts the attempt as soon as it starts', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      const described = await service.describe(provider());
      expect(described.attempts).toBe(1);
    });

    it('waits before allowing another after a failure', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'failure');

      const described = await service.describe(provider());
      expect(described.eligible).toBe(false);
      expect(described.reason).toMatch(/Waiting until/);
      expect(Date.parse(described.cooldownUntil as string)).toBeGreaterThan(Date.now());
    });

    it('waits longer after the second failure', async () => {
      const { service, store } = build();
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'failure');
      const first = Date.parse(
        (await service.describe(provider())).cooldownUntil as string,
      );

      // Serve out the first wait rather than pretending it did not happen.
      store.set('provider:autologin:attempts:zaryar', {
        count: 1,
        cooldownUntil: new Date(Date.now() - 1000).toISOString(),
        lastAt: new Date().toISOString(),
      });
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'failure');
      const second = Date.parse((await service.describe(provider())).cooldownUntil as string);

      expect(second).toBeGreaterThan(first);
    });

    /**
     * Trying forever is what gets an account suspended. After enough failures
     * the answer is a person, not another attempt.
     */
    it('stops entirely after three failures and says a person is needed', async () => {
      const { service, store } = build();
      store.set('provider:autologin:attempts:zaryar', {
        count: 3,
        cooldownUntil: null,
        lastAt: new Date().toISOString(),
      });

      const described = await service.describe(provider());
      expect(described.eligible).toBe(false);
      expect(described.reason).toMatch(/needs someone/);
      await expect(service.claim(provider(), 'phone-1')).rejects.toThrow(/needs someone/);
    });

    it('caps the attempts in a day however they turn out', async () => {
      const { service, store } = build();
      store.set('provider:autologin:daily:zaryar', 6);
      const described = await service.describe(provider());
      expect(described.reason).toMatch(/Daily limit/);
    });

    it('starts over once a login works', async () => {
      const { service } = build();
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'success');

      const described = await service.describe(provider());
      expect(described.attempts).toBe(0);
      expect(described.eligible).toBe(true);
    });

    /**
     * Whoever fixed it, it is fixed. A count of failures at getting a provider
     * working describes nothing once the provider is working.
     */
    it('starts over when a person activates it from the panel', async () => {
      const { service, store } = build();
      store.set('provider:autologin:attempts:zaryar', {
        count: 3,
        cooldownUntil: new Date(Date.now() + 3_600_000).toISOString(),
        lastAt: new Date().toISOString(),
      });

      await service.noteActivated('zaryar');

      const described = await service.describe(provider());
      expect(described.attempts).toBe(0);
      expect(described.cooldownUntil).toBeNull();
    });

    // The daily cap is not cleared by success: it counts what was asked of the
    // provider, and a success asked for a code just the same.
    it('keeps counting the day’s attempts across a success', async () => {
      const { service, store } = build();
      await service.claim(provider(), 'phone-1');
      await service.release(provider(), 'phone-1', 'success');
      expect(store.get('provider:autologin:daily:zaryar')).toBe(1);
    });
  });
});
