import { ProviderService } from './provider.service';
import { ProviderEntity } from './entity/provider.entity';
import { requireProviderUrl } from './providers/require-provider-url';
import { clearProxyRoutes, lookupProxyRoute } from '../common/http/proxy-route.registry';

/**
 * The two ways activation used to fail before it ever reached the provider.
 *
 * Both are silent: `ProviderManageConsumer` catches everything a command
 * handler throws and logs it, so neither ever surfaced in the panel.
 */
describe('provider activation', () => {
  const entity = (over: Partial<ProviderEntity> = {}): ProviderEntity =>
    ({
      id: 'engine-uuid',
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      auth: {},
      config: {},
      active: false,
      ...over,
    }) as ProviderEntity;

  describe('a command must not move the primary key', () => {
    /**
     * The backend mirror holds its own UUID for the same provider and used to
     * put it in the command body. `Object.assign(provider, data)` then wrote it
     * over the engine's `id`, and the `save()` that followed either updated a
     * row that does not exist or tried to insert a duplicate `key`.
     */
    const update = async (data: Record<string, any>) => {
      const row = entity();
      const repo = {
        find: jest.fn().mockResolvedValue([row]),
        findOne: jest.fn().mockResolvedValue(row),
        save: jest.fn((e: ProviderEntity) => Promise.resolve(e)),
      };
      const service = new ProviderService(
        repo as any,
        { getProvider: () => undefined, restartProvider: jest.fn() } as any,
        new Map(),
        { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
        { setJson: jest.fn() } as any,
      );
      const saved = await service.update('engine-uuid', data as any);
      return { saved, repo };
    };

    it("keeps its own id when the payload carries the backend's", async () => {
      const { saved } = await update({
        id: 'backend-uuid',
        key: 'zaryar',
        persianName: 'زریار',
      });
      expect(saved.id).toBe('engine-uuid');
    });

    it('still applies the fields the command actually meant to change', async () => {
      const { saved } = await update({ id: 'backend-uuid', persianName: 'زریار' });
      expect(saved.persianName).toBe('زریار');
    });

    it('ignores timestamps the mirror kept', async () => {
      const stamp = new Date('2020-01-01');
      const { saved } = await update({ createdAt: stamp, updatedAt: stamp });
      expect(saved.createdAt).not.toBe(stamp);
      expect(saved.updatedAt).not.toBe(stamp);
    });
  });

  describe('a missing OTP url names itself', () => {
    // The handlers fell back to `${provider.sendOtpUrl}` — the very field they
    // were testing — so an unconfigured provider posted to the literal string
    // "undefined" and failed deep inside axios.
    it('refuses to send a code without sendOtpUrl', () => {
      expect(() => requireProviderUrl(entity(), 'sendOtpUrl')).toThrow(/sendOtpUrl/);
    });

    it('treats whitespace as unset', () => {
      expect(() =>
        requireProviderUrl(entity({ sendOtpUrl: '   ' }), 'sendOtpUrl'),
      ).toThrow(/sendOtpUrl/);
    });

    it('names the provider, so the admin knows which row to fix', () => {
      expect(() => requireProviderUrl(entity({ key: 'talaab' }), 'verifyCodeUrl')).toThrow(
        /"talaab"/,
      );
    });

    it('returns the url when it is configured', () => {
      const url = 'https://example.ir/api/send';
      expect(requireProviderUrl(entity({ sendOtpUrl: url }), 'sendOtpUrl')).toBe(url);
    });
  });

  describe('a provider declares how it is reached', () => {
    beforeEach(() => clearProxyRoutes());

    const service = (rows: ProviderEntity[]) =>
      new ProviderService(
        {
          find: jest.fn().mockResolvedValue(rows),
          findOne: jest.fn().mockResolvedValue(rows[0]),
          create: jest.fn((d: any) => d),
          save: jest.fn((e: any) => Promise.resolve(e)),
        } as any,
        { getProvider: () => undefined, startProvider: jest.fn() } as any,
        new Map(),
        { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
        { setJson: jest.fn() } as any,
      );

    /**
     * Every URL the provider is reached on has to be declared, not just the
     * base: activation talks to the OTP endpoints, and those are frequently on
     * a different host from the price socket.
     */
    it('claims every host it talks to, under its own flag', async () => {
      await service([
        entity({
          useProxy: true,
          baseUrl: 'https://socket.example.ir/signalr',
          apiBaseUrl: 'https://api.example.ir',
          sendOtpUrl: 'https://auth.example.ir/send',
          verifyCodeUrl: 'https://auth.example.ir/verify',
        }),
      ]).syncProxyRoutes();

      expect(lookupProxyRoute('socket.example.ir')).toBe(true);
      expect(lookupProxyRoute('api.example.ir')).toBe(true);
      expect(lookupProxyRoute('auth.example.ir')).toBe(true);
    });

    it('carries a provider that opted out', async () => {
      await service([
        entity({ key: 'global', useProxy: false, baseUrl: 'https://global.example.com/ws' }),
      ]).syncProxyRoutes();

      expect(lookupProxyRoute('global.example.com')).toBe(false);
    });

    it('treats a row from before the column as proxied', async () => {
      await service([
        entity({ useProxy: undefined as any, baseUrl: 'https://legacy.example.ir' }),
      ]).syncProxyRoutes();

      expect(lookupProxyRoute('legacy.example.ir')).toBe(true);
    });
  });

  describe('activating with credentials captured by hand', () => {
    const build = (row: ProviderEntity, running = false) => {
      const manager = {
        getProvider: jest.fn(() => (running ? {} : undefined)),
        restartProvider: jest.fn(() => Promise.resolve()),
        startProvider: jest.fn(() => Promise.resolve()),
      };
      const service = new ProviderService(
        {
          find: jest.fn().mockResolvedValue([row]),
          findOne: jest.fn().mockResolvedValue(row),
          save: jest.fn((e: any) => Promise.resolve(e)),
        } as any,
        manager as any,
        new Map(),
        { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as any,
        { setJson: jest.fn() } as any,
      );
      return { service, manager };
    };

    it('stores the credentials and turns the provider on', async () => {
      const { service } = build(entity());
      const saved = await service.setAuth('engine-uuid', { token: 'tok-1', uId: 'u-1' });
      expect(saved.active).toBe(true);
      expect(saved.auth).toMatchObject({ token: 'tok-1', uId: 'u-1' });
    });

    /**
     * These came from one login. Merging them over a previous session's fields
     * would produce a credential set that never existed — a new token beside a
     * stale sessionId.
     */
    it('replaces the previous session rather than merging into it', async () => {
      const { service } = build(entity({ auth: { token: 'old', sessionId: 'stale' } }));
      const saved = await service.setAuth('engine-uuid', { token: 'new' });
      expect(saved.auth).toEqual({ token: 'new' });
    });

    it('refuses credentials with no token', async () => {
      const { service } = build(entity());
      await expect(service.setAuth('engine-uuid', { uId: 'u-1' })).rejects.toThrow(/token/i);
    });

    it('trims the token it stores', async () => {
      const { service } = build(entity());
      const saved = await service.setAuth('engine-uuid', { token: '  tok  ' });
      expect(saved.auth.token).toBe('tok');
    });

    it('starts a provider that was not running', async () => {
      const { service, manager } = build(entity(), false);
      await service.setAuth('engine-uuid', { token: 'tok' });
      expect(manager.startProvider).toHaveBeenCalled();
      expect(manager.restartProvider).not.toHaveBeenCalled();
    });

    // A running provider is holding the credentials these replace, so leaving
    // it alone would keep it on the old ones.
    it('restarts one that was already running onto the new credentials', async () => {
      const { service, manager } = build(entity(), true);
      await service.setAuth('engine-uuid', { token: 'tok' });
      expect(manager.restartProvider).toHaveBeenCalledWith('zaryar');
      expect(manager.startProvider).not.toHaveBeenCalled();
    });
  });
});
