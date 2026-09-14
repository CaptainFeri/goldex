import { ProviderService } from './provider.service';
import { ProviderEntity } from './entity/provider.entity';

/**
 * The admin mirror's two obligations to the panel.
 *
 * Every row it hands back has to be addressable — the panel builds
 * `/admin/providers/:id/…` out of it — and nothing it sends to the engine may
 * carry an identity, because the engine keeps its own.
 */
describe('provider admin mirror', () => {
  const build = (rows: Partial<ProviderEntity>[], registry: any[] = [], live: string[] = []) => {
    const saved: Partial<ProviderEntity>[] = [...rows];
    const repo = {
      find: jest.fn(() => Promise.resolve(saved.map((r) => ({ ...r }) as ProviderEntity))),
      findOne: jest.fn(({ where }: any) =>
        Promise.resolve(
          saved.find((r) =>
            where.id !== undefined ? r.id === where.id : r.key === where.key,
          ) ?? null,
        ),
      ),
      create: jest.fn((data: any) => data),
      save: jest.fn((data: any) => {
        const row = { ...data, id: data.id ?? `adopted-${data.key}` };
        const at = saved.findIndex((r) => r.key === row.key);
        if (at === -1) saved.push(row);
        else saved[at] = row;
        return Promise.resolve(row);
      }),
      count: jest.fn(() => Promise.resolve(saved.length)),
      update: jest.fn(() => Promise.resolve()),
    };
    const rmq = {
      publishCommand: jest.fn((..._args: any[]) => Promise.resolve()),
      requestCommand: jest.fn((..._args: any[]) =>
        Promise.resolve({ ok: true, data: {} } as any),
      ),
    };
    const service = new ProviderService(
      repo as any,
      rmq as any,
      {
        getProviders: () => Promise.resolve(live),
        getRegistry: () => Promise.resolve(registry),
      } as any,
    );
    return { service, repo, rmq };
  };

  describe('every listed provider is addressable', () => {
    /**
     * A provider created straight in the engine's DB reaches the panel through
     * the Redis registry. It used to be listed with `id: undefined`, so the
     * activation button called `/admin/providers/undefined/send-otp` and
     * ParseUUIDPipe answered 400 — the provider was visible and untouchable.
     */
    it('adopts a registry provider that has no mirror row', async () => {
      const { service } = build([], [{ key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir' }]);
      const list = await service.findAll();
      expect(list).toHaveLength(1);
      expect(list[0].key).toBe('zaryar');
      expect(list[0].id).toBeTruthy();
    });

    it('adopts a provider that is only reporting prices', async () => {
      const { service } = build([], [], ['talaab']);
      const list = await service.findAll();
      expect(list.map((p) => p.key)).toEqual(['talaab']);
      expect(list[0].id).toBeTruthy();
    });

    it('leaves an already-mirrored provider on its existing id', async () => {
      const { service } = build(
        [{ id: 'mine', key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir' }],
        [{ key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir' }],
      );
      const list = await service.findAll();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('mine');
    });

    it('prefers the engine registry for the fields it reports', async () => {
      const { service } = build(
        [{ id: 'mine', key: 'zaryar', category: 'zaryar', baseUrl: 'https://old.ir' }],
        [{ key: 'zaryar', category: 'zaryar', baseUrl: 'https://new.ir', active: true }],
      );
      const [row] = await service.findAll();
      expect(row.baseUrl).toBe('https://new.ir');
      expect(row.active).toBe(true);
    });
  });

  describe('the proxy declaration reaches the engine', () => {
    // The engine owns the routing; this mirror only has to carry the flag there
    // intact, and show the engine's own value back to the panel.
    it('ships useProxy on the create command', async () => {
      const { service, rmq } = build([]);
      await service.create({
        key: 'global',
        category: 'zaryar',
        baseUrl: 'https://global.example.com',
        phone: '0912',
        useProxy: false,
      } as any);
      const [, payload] = rmq.publishCommand.mock.calls.at(-1)!;
      expect(payload).toMatchObject({ key: 'global', useProxy: false });
    });

    it('defaults a provider defined without the flag to proxied', async () => {
      const { service, rmq } = build([]);
      await service.create({
        key: 'zaryar',
        category: 'zaryar',
        baseUrl: 'https://a.ir',
        phone: '0912',
      } as any);
      const [, payload] = rmq.publishCommand.mock.calls.at(-1)!;
      expect(payload).toMatchObject({ useProxy: true });
    });

    it("shows the engine's value rather than a stale mirrored one", async () => {
      const { service } = build(
        [{ id: 'mine', key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir', useProxy: true }],
        [{ key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir', useProxy: false }],
      );
      const [row] = await service.findAll();
      expect(row.useProxy).toBe(false);
    });

    it('reads a provider from before the column as proxied', async () => {
      const { service } = build([], [{ key: 'legacy', category: 'zaryar', baseUrl: 'https://a.ir' }]);
      const [row] = await service.findAll();
      expect(row.useProxy).toBe(true);
    });
  });

  describe('commands carry no identity', () => {
    // The engine resolves every command by `key` and holds a different UUID for
    // the same provider. Sending this mirror's id let it be assigned over the
    // engine row's primary key, so an edit from the panel silently collided
    // with the unique `key` instead of applying.
    it('omits the id when publishing an update', async () => {
      const { service, rmq } = build([
        { id: 'mine', key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir' },
      ]);
      await service.update('mine', { persianName: 'زریار' } as any);
      const [, payload] = rmq.publishCommand.mock.calls.at(-1)!;
      expect(payload).not.toHaveProperty('id');
      expect(payload).toMatchObject({ key: 'zaryar', persianName: 'زریار' });
    });

    it('omits the id when publishing a toggle', async () => {
      const { service, rmq } = build([
        { id: 'mine', key: 'zaryar', category: 'zaryar', baseUrl: 'https://a.ir', active: false },
      ]);
      await service.toggleActive('mine');
      const [, payload] = rmq.publishCommand.mock.calls.at(-1)!;
      expect(payload).toEqual({ key: 'zaryar' });
    });
  });

  describe('activation reports what actually happened', () => {
    const provider = {
      id: 'mine',
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://a.ir',
      phone: '09120000000',
    };

    /**
     * The engine is the only thing that talks to the provider, so it is the
     * only thing that knows the code was wrong. This used to publish and return
     * "submitted", so the panel showed success over every rejection and the
     * reason stayed in the engine's container log.
     */
    it('fails the request with the reason the engine gave', async () => {
      const { service, rmq } = build([provider]);
      rmq.requestCommand.mockResolvedValue({ ok: false, error: 'Verification failed' });

      await expect(service.verifyOtp('mine', '1234')).rejects.toThrow('Verification failed');
    });

    it('does not activate the mirror on a rejected code', async () => {
      const { service, rmq } = build([provider]);
      rmq.requestCommand.mockResolvedValue({ ok: false, error: 'Verification failed' });

      await service.verifyOtp('mine', '1234').catch(() => undefined);
      const [row] = await service.findAll();
      expect(row.active).toBeFalsy();
    });

    it('activates the mirror when the engine says the provider is on', async () => {
      const { service, rmq } = build([provider]);
      rmq.requestCommand.mockResolvedValue({ ok: true, data: { key: 'zaryar', active: true } });

      await service.verifyOtp('mine', '1234');
      const [row] = await service.findAll();
      expect(row.active).toBe(true);
    });

    it('separates "the engine said no" from "the engine never answered"', async () => {
      const { service, rmq } = build([provider]);
      rmq.requestCommand.mockRejectedValue(new Error('did not answer within 20s'));

      // 503, not 400: the admin's code may have been perfectly good.
      await expect(service.verifyOtp('mine', '1234')).rejects.toMatchObject({
        status: 503,
      });
    });

    it('records the phone only once a code has actually gone out', async () => {
      const { service, rmq } = build([{ ...provider, phone: undefined }]);
      rmq.requestCommand.mockResolvedValue({ ok: false, error: 'no sendOtpUrl configured' });

      await service.sendOtp('mine', '09121111111').catch(() => undefined);
      const [row] = await service.findAll();
      expect(row.phone).toBeUndefined();
    });

    it('records it when the code did go out', async () => {
      const { service, rmq } = build([{ ...provider, phone: undefined }]);
      rmq.requestCommand.mockResolvedValue({ ok: true, data: { message: 'OTP sent' } });

      await service.sendOtp('mine', '09121111111');
      const [row] = await service.findAll();
      expect(row.phone).toBe('09121111111');
    });

    it('still refuses to verify before any code was sent', async () => {
      const { service } = build([{ ...provider, phone: undefined }]);
      await expect(service.verifyOtp('mine', '1234')).rejects.toThrow(/send OTP first/i);
    });
  });
});
