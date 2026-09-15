import { RedisService } from './redis.service';
import { ACTIVE_PROVIDERS_KEY, providerItemsKey, providerPricesKey } from './keys';
import { PriceData } from '../real-time-provider/types/price-data.type';

/**
 * How a provider's data is stored.
 *
 * The old layout kept the same fact in three places — a string per item, a set
 * of key names, and a snapshot hash — written by different call sites that did
 * not agree, with per-item expiry on top. Its failures were all silent: a list
 * that shrank an item at a time, a set that counted providers which had stopped
 * reporting weeks earlier, a snapshot that drifted from the prices beside it.
 *
 * These are about the properties that replaced them: one key per concept,
 * written whole, expiring as a unit.
 */
describe('a provider’s data in Redis', () => {
  /** A fake with the handful of commands the service uses, behaving like Redis. */
  const fakeRedis = () => {
    const hashes = new Map<string, Map<string, string>>();
    const sets = new Map<string, Set<string>>();
    const zsets = new Map<string, Map<string, number>>();
    const ttls = new Map<string, number>();

    const hash = (k: string) => {
      if (!hashes.has(k)) hashes.set(k, new Map());
      return hashes.get(k)!;
    };
    const set = (k: string) => {
      if (!sets.has(k)) sets.set(k, new Set());
      return sets.get(k)!;
    };

    const ops = {
      hset: (k: string, f: string, v: string) => hash(k).set(f, v),
      hdel: (k: string, f: string) => hash(k).delete(f),
      del: (k: string) => {
        hashes.delete(k);
        sets.delete(k);
        zsets.delete(k);
        ttls.delete(k);
      },
      expire: (k: string, s: number) => ttls.set(k, s),
      sadd: (k: string, ...v: string[]) => v.forEach((x) => set(k).add(x)),
      srem: (k: string, ...v: string[]) => v.forEach((x) => set(k).delete(x)),
      zadd: (k: string, score: number, v: string) => {
        if (!zsets.has(k)) zsets.set(k, new Map());
        zsets.get(k)!.set(v, score);
      },
      zremrangebyrank: () => undefined,
      exists: (k: string) => (hashes.has(k) || sets.has(k) || zsets.has(k) ? 1 : 0),
    };

    // A pipeline records calls and replays them on exec, like ioredis.
    const pipeline = () => {
      const queued: (() => unknown)[] = [];
      const chain: any = new Proxy(
        {},
        {
          get: (_t, prop: string) => {
            if (prop === 'exec') {
              return async () => queued.map((fn) => [null, fn()]);
            }
            return (...args: any[]) => {
              queued.push(() => (ops as any)[prop]?.(...args));
              return chain;
            };
          },
        },
      );
      return chain;
    };

    const client: any = {
      pipeline,
      hset: async (k: string, f: string, v: string) => ops.hset(k, f, v),
      hget: async (k: string, f: string) => hash(k).get(f) ?? null,
      hgetall: async (k: string) => Object.fromEntries(hash(k)),
      hkeys: async (k: string) => [...hash(k).keys()],
      smembers: async (k: string) => [...set(k)],
      srem: async (k: string, ...v: string[]) => ops.srem(k, ...v),
      del: async (k: string) => ops.del(k),
      zrevrange: async (k: string, start: number, stop: number) =>
        [...(zsets.get(k) ?? new Map())]
          .sort((a, b) => b[1] - a[1])
          .slice(start, stop + 1)
          .map(([v]) => v),
      keys: async () => {
        throw new Error('KEYS must never be used: it blocks the server');
      },
    };
    return { client, hashes, sets, ttls };
  };

  const price = (itemId: number, buy = 100): PriceData =>
    ({
      itemId,
      buyPrice: buy,
      sellPrice: buy + 5,
      timestamp: new Date().toISOString(),
    }) as PriceData;

  const build = () => {
    const fake = fakeRedis();
    const service = new RedisService(fake.client, {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    } as any);
    return { service, ...fake };
  };

  describe('the symbols a provider offers', () => {
    it('are one list, read in one round trip', async () => {
      const { service } = build();
      await service.setProviderItems('zaryar', [
        { itemId: 1, name: 'طلای آبشده' },
        { itemId: 2, name: 'سکه' },
      ]);

      const items = await service.getProviderItems('zaryar');
      expect(items).toHaveLength(2);
      expect(items).toContainEqual({ itemId: 1, name: 'طلای آبشده' });
    });

    /**
     * The old layout gave each item its own key and its own expiry, so a symbol
     * the provider had withdrawn stayed in the list until it happened to lapse.
     */
    it('lose a symbol the provider stopped offering', async () => {
      const { service } = build();
      await service.setProviderItems('zaryar', [{ itemId: 1 }, { itemId: 2 }]);
      await service.setProviderItems('zaryar', [{ itemId: 1 }]);

      const items = await service.getProviderItems('zaryar');
      expect(items.map((i: any) => i.itemId)).toEqual([1]);
    });

    it('expire as one list rather than an item at a time', async () => {
      const { service, ttls } = build();
      await service.setProviderItems('zaryar', [{ itemId: 1 }, { itemId: 2 }]);
      // One key carries the expiry, so the list is either whole or gone.
      expect(ttls.get(providerItemsKey('zaryar'))).toBeGreaterThan(0);
      expect([...ttls.keys()]).toEqual([providerItemsKey('zaryar')]);
    });

    /**
     * An empty result is a failed fetch far more often than a provider that
     * has withdrawn everything, and from here the two look identical. Keeping
     * the previous list is the recoverable mistake; wiping it loses the names
     * for every price still arriving.
     */
    it('are not wiped by a fetch that came back empty', async () => {
      const { service } = build();
      await service.setProviderItems('zaryar', [{ itemId: 1, name: 'طلای آبشده' }]);
      await service.setProviderItems('zaryar', []);

      expect(await service.getProviderItems('zaryar')).toHaveLength(1);
    });

    it('skip an entry with no id rather than storing it unfindable', async () => {
      const { service } = build();
      await service.setProviderItems('zaryar', [{ itemId: 1 }, { name: 'nameless' }]);
      expect(await service.getProviderItems('zaryar')).toHaveLength(1);
    });

    it('take a single symbol without rewriting the list', async () => {
      const { service } = build();
      await service.setProviderItems('zaryar', [{ itemId: 1, name: 'a' }]);
      await service.setProviderItem('zaryar', 2, { itemId: 2, name: 'b' });

      const items = await service.getProviderItems('zaryar');
      expect(items).toHaveLength(2);
    });
  });

  describe('current prices', () => {
    it('live in one hash per provider', async () => {
      const { service, hashes } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      await service.setCurrentPrice('zaryar', 2, price(2));

      expect(hashes.get(providerPricesKey('zaryar'))?.size).toBe(2);
      expect(await service.getAllCurrentPrices('zaryar')).toHaveLength(2);
    });

    it('carry the provider they came from', async () => {
      const { service } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      const [stored] = await service.getAllCurrentPrices('zaryar');
      expect(stored.providerKey).toBe('zaryar');
    });

    /**
     * The snapshot used to be a second hash, written by only some of the paths
     * that wrote prices, so a reader could not tell which of the two was
     * current. They are the same thing now.
     */
    it('are what the snapshot reads', async () => {
      const { service } = build();
      await service.setCurrentPrice('zaryar', 7, price(7, 999));

      const snapshot = await service.getSnapshot('zaryar');
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].buyPrice).toBe(999);
    });

    it('are replaced whole by a full save', async () => {
      const { service } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      await service.saveItems('zaryar', [price(2)]);

      const all = await service.getAllCurrentPrices('zaryar');
      expect(all.map((p) => p.itemId)).toEqual([2]);
    });
  });

  describe('which providers are reporting', () => {
    it('comes from an index, never a keyspace scan', async () => {
      const { service } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      await service.setCurrentPrice('talaab', 1, price(1));

      // The fake throws on KEYS, so this passing is the assertion.
      expect(await service.getActiveProviders()).toEqual(['talaab', 'zaryar']);
    });

    /**
     * The old set held key names that expired an hour later while the set
     * itself never did, so it counted providers that had long since gone
     * quiet — and the panel showed them as live.
     */
    it('drops a provider whose data has expired', async () => {
      const { service, sets, client } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      await service.setCurrentPrice('talaab', 1, price(1));

      await client.del(providerPricesKey('talaab'));

      expect(await service.getActiveProviders()).toEqual(['zaryar']);
      // And is forgotten, rather than re-checked for ever.
      expect([...sets.get(ACTIVE_PROVIDERS_KEY)!]).toEqual(['zaryar']);
    });

    /**
     * The two halves arrive by different routes and fail independently, and
     * both were seen live: a Talaab provider had published its symbol list and
     * no prices (its shop was shut), while two Zaryar providers were streaming
     * prices with no symbol list (their metadata call was being refused).
     * Requiring prices did not merely hide the first — it pruned it from the
     * index, so a provider with a published symbol list vanished.
     */
    it('counts a provider that has symbols but no prices yet', async () => {
      const { service, sets } = build();
      await service.setProviderItems('afrogh', [{ itemId: 1, name: 'طلای آبشده' }]);

      expect(await service.getActiveProviders()).toEqual(['afrogh']);
      expect([...sets.get(ACTIVE_PROVIDERS_KEY)!]).toContain('afrogh');
    });

    it('counts a provider that has prices but no symbols yet', async () => {
      const { service } = build();
      await service.setCurrentPrice('ariana', 1, price(1));
      expect(await service.getActiveProviders()).toEqual(['ariana']);
    });

    it('drops one only when both halves are gone', async () => {
      const { service, client } = build();
      await service.setProviderItems('afrogh', [{ itemId: 1 }]);
      await service.setCurrentPrice('afrogh', 1, price(1));

      await client.del(providerPricesKey('afrogh'));
      expect(await service.getActiveProviders()).toEqual(['afrogh']);

      await client.del(providerItemsKey('afrogh'));
      expect(await service.getActiveProviders()).toEqual([]);
    });

    it('is empty before anything has reported', async () => {
      const { service } = build();
      expect(await service.getActiveProviders()).toEqual([]);
    });

    it('forgets a provider that is torn down', async () => {
      const { service } = build();
      await service.setCurrentPrice('zaryar', 1, price(1));
      await service.deleteSnapshot('zaryar');
      expect(await service.getActiveProviders()).toEqual([]);
    });
  });

  describe('history', () => {
    it('is kept per item, newest first', async () => {
      const { service } = build();
      await service.addPriceToHistory('zaryar', 1, {
        ...price(1, 100),
        timestamp: '2026-01-01T00:00:00.000Z',
      } as PriceData);
      await service.addPriceToHistory('zaryar', 1, {
        ...price(1, 200),
        timestamp: '2026-01-01T00:00:01.000Z',
      } as PriceData);

      const history = await service.getPriceHistory('zaryar', 1);
      expect(history.map((h) => h.buyPrice)).toEqual([200, 100]);
    });

    // The old history keys never expired: each was capped, but the number of
    // them grew without limit as items came and went.
    it('expires, so a withdrawn item does not leave a key behind for ever', async () => {
      const { service, ttls } = build();
      await service.addPriceToHistory('zaryar', 1, price(1));
      expect(ttls.get('provider:zaryar:history:1')).toBeGreaterThan(0);
    });

    it('survives a malformed record instead of failing the read', async () => {
      const { service, client } = build();
      await service.addPriceToHistory('zaryar', 1, price(1));
      await client.pipeline().zadd('provider:zaryar:history:1', 9, 'not json').exec();

      expect(await service.getPriceHistory('zaryar', 1)).toHaveLength(1);
    });
  });
});
