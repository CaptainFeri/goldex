import { ProviderService } from './provider.service';
import { ProviderEntity } from './entity/provider.entity';

/**
 * Logging a provider back in after its session has expired.
 *
 * This used to be impossible. `active` means "meant to be running", and a
 * provider whose session expired is still meant to be running, so the guard on
 * `active` refused the login that was the only way to fix it. A session, once
 * expired, stayed expired until somebody deactivated the provider by hand.
 */
describe('logging a provider back in', () => {
  const entity = (over: Partial<ProviderEntity> = {}): ProviderEntity =>
    ({
      id: 'engine-uuid',
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      phone: '09123456789',
      auth: {},
      config: {},
      active: false,
      ...over,
    }) as ProviderEntity;

  /**
   * @param running what the manager reports for this provider: nothing, a
   *   connected one, or one that is registered but not connected.
   */
  const build = (
    row: ProviderEntity,
    running?: { connected: boolean; expired?: boolean },
    handler: Partial<{ sendOtp: jest.Mock; verifyOtp: jest.Mock }> = {},
  ) => {
    const saved: ProviderEntity[] = [];
    const repo = {
      find: jest.fn().mockResolvedValue([row]),
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn((e: ProviderEntity) => {
        saved.push(e);
        return Promise.resolve(e);
      }),
    };
    const manager = {
      getProvider: jest.fn(() =>
        running
          ? {
              isConnected: () => running.connected,
              hasExpiredSession: () => running.expired ?? false,
            }
          : undefined,
      ),
      startProvider: jest.fn(() => Promise.resolve()),
      restartProvider: jest.fn(() => Promise.resolve()),
    };
    const otp = {
      sendOtp: handler.sendOtp ?? jest.fn(() => Promise.resolve()),
      verifyOtp:
        handler.verifyOtp ?? jest.fn(() => Promise.resolve({ token: 'fresh-token' })),
    };
    const service = new ProviderService(
      repo as any,
      manager as any,
      new Map([['zaryar', otp as any]]),
      { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
      { setJson: jest.fn() } as any,
    );
    return { service, repo, manager, otp, row };
  };

  describe('asking for a code', () => {
    it('is allowed for an active provider that is no longer connected', async () => {
      const { service } = build(entity({ active: true }), { connected: false });
      await expect(service.sendOtp('engine-uuid', '09123456789')).resolves.toMatchObject({
        message: expect.stringContaining('zaryar'),
      });
    });

    it('is allowed for an active provider that is not running at all', async () => {
      const { service } = build(entity({ active: true }));
      await expect(service.sendOtp('engine-uuid', '09120000000')).resolves.toBeDefined();
    });

    /**
     * The one case the old guard was right about. A provider serving prices is
     * working; logging it in again would replace a session that is in use, and
     * nothing about a working provider asks for that.
     */
    it('is refused for a provider that is connected and serving', async () => {
      const { service } = build(entity({ active: true }), { connected: true });
      await expect(service.sendOtp('engine-uuid', '09123456789')).rejects.toThrow(/connected/i);
    });

    it('is allowed for one that is connected but has had its session refused', async () => {
      // Talaab opens its socket even when the session behind it is dead, so
      // "connected" alone does not mean it is working.
      const { service } = build(entity({ active: true }), { connected: true, expired: true });
      await expect(service.sendOtp('engine-uuid', '09123456789')).resolves.toBeDefined();
    });

    /**
     * The token used to be deleted here, before the provider had even answered.
     * A send that then failed — a wrong number, a provider that is down — left
     * the provider with no session at all, which is worse than the expired one
     * it had.
     */
    it('keeps the existing session until a new one is proven', async () => {
      const row = entity({ active: true, auth: { token: 'old-token', sessionId: 's-1' } });
      const { service } = build(row, { connected: false });
      await service.sendOtp('engine-uuid', '09123456789');
      expect(row.auth.token).toBe('old-token');
    });

    it('keeps it even when the provider refuses to send a code', async () => {
      const row = entity({ active: true, auth: { token: 'old-token' } });
      const { service } = build(row, { connected: false }, {
        sendOtp: jest.fn(() => Promise.reject(new Error('provider said no'))),
      });
      await expect(service.sendOtp('engine-uuid', '09123456789')).rejects.toThrow();
      expect(row.auth.token).toBe('old-token');
    });

    it('records the number the code was sent to', async () => {
      const row = entity({ active: true });
      const { service } = build(row, { connected: false });
      await service.sendOtp('engine-uuid', '09120000000');
      expect(row.phone).toBe('09120000000');
    });
  });

  describe('verifying the code', () => {
    it('is allowed for an active provider that is no longer connected', async () => {
      const { service } = build(entity({ active: true }), { connected: false });
      const saved = await service.verifyOtp('engine-uuid', '12345');
      expect(saved.auth.token).toBe('fresh-token');
      expect(saved.active).toBe(true);
    });

    it('is refused for a provider that is connected and serving', async () => {
      const { service } = build(entity({ active: true }), { connected: true });
      await expect(service.verifyOtp('engine-uuid', '12345')).rejects.toThrow(/connected/i);
    });

    /**
     * The new credentials came from one login. Keeping the previous session's
     * fields beside them would make a set that never existed — a fresh token
     * with the last shift's sessionId.
     */
    it('replaces the previous session rather than merging into it', async () => {
      const row = entity({
        active: true,
        auth: { token: 'old-token', sessionId: 'stale', shopkeeperId: '42' },
      });
      const { service } = build(row, { connected: false });
      const saved = await service.verifyOtp('engine-uuid', '12345');
      expect(saved.auth).toEqual({ token: 'fresh-token' });
    });

    it('keeps whatever the login itself returned alongside the token', async () => {
      const { service } = build(entity({ active: true }), { connected: false }, {
        verifyOtp: jest.fn(() =>
          Promise.resolve({ token: 'fresh-token', extra: { sessionId: 'new', uId: 'u-9' } }),
        ),
      });
      const saved = await service.verifyOtp('engine-uuid', '12345');
      expect(saved.auth).toEqual({ token: 'fresh-token', sessionId: 'new', uId: 'u-9' });
    });

    it('carries the provider’s apiBaseUrl into the new session', async () => {
      const { service } = build(
        entity({ active: true, category: 'zaryar', apiBaseUrl: 'https://api.example.ir' }),
        { connected: false },
      );
      const saved = await service.verifyOtp('engine-uuid', '12345');
      expect(saved.auth.apiBaseUrl).toBe('https://api.example.ir');
    });

    it('brings the provider back up on the new session', async () => {
      const { service, manager } = build(entity({ active: true }), { connected: false });
      await service.verifyOtp('engine-uuid', '12345');
      expect(manager.startProvider).toHaveBeenCalled();
    });

    it('leaves the old session in place when verification fails', async () => {
      const row = entity({ active: true, auth: { token: 'old-token' } });
      const { service } = build(row, { connected: false }, {
        verifyOtp: jest.fn(() => Promise.reject(new Error('wrong code'))),
      });
      await expect(service.verifyOtp('engine-uuid', '99999')).rejects.toThrow();
      expect(row.auth.token).toBe('old-token');
    });
  });
});
