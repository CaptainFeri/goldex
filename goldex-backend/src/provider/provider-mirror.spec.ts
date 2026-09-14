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
    const rmq = { publishCommand: jest.fn((..._args: any[]) => Promise.resolve()) };
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
});
