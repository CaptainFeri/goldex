import { PricePersistenceService } from './price-persistence.service';
import { PriceSnapshot, sideToAction } from './price.types';
import { RedisService } from '../../redis/redis.service';

function mockRedis(): RedisService {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const sorted = new Map<string, Map<string, number>>();
  const client = {
    setex: jest.fn(async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    mget: jest.fn(async (...keys: string[]) =>
      keys.map((k) => store.get(k) ?? null),
    ),
    zadd: jest.fn(async (key: string, score: number, member: string) => {
      if (!sorted.has(key)) sorted.set(key, new Map());
      sorted.get(key).set(member, score);
      return 1;
    }),
    zrange: jest.fn(async (key: string, _min: number, _max: number) => {
      const map = sorted.get(key);
      if (!map) return [];
      return [...map.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    }),
    sadd: jest.fn(async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(member);
      return 1;
    }),
    smembers: jest.fn(async (key: string) => [...(sets.get(key) ?? [])]),
    on: jest.fn(),
    quit: jest.fn(),
  } as any;
  return { getClient: () => client, onModuleDestroy: jest.fn() } as any;
}

function snapshot(over: Partial<PriceSnapshot>): PriceSnapshot {
  const base: PriceSnapshot = {
    price: 73500000,
    sideLabel: 'خرید',
    ourAction: 'WE_SELL',
    subType: 'normal',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
    messageId: 1,
    date: 1000,
    categoryKey: 'normal',
    ...over,
  };
  return { ...base, ourAction: sideToAction(base.sideLabel) };
}

describe('PricePersistenceService', () => {
  let service: PricePersistenceService;

  beforeEach(() => {
    service = new PricePersistenceService(mockRedis());
  });

  it('filters by sub-type, action (our perspective) and date range', () => {
    service.handlePrice({
      snapshot: snapshot({
        messageId: 1,
        date: 100,
        subType: 'shena',
        sideLabel: 'خرید',
      }),
    });
    service.handlePrice({
      snapshot: snapshot({
        messageId: 2,
        date: 200,
        subType: 'normal',
        sideLabel: 'فروش',
      }),
    });
    service.handlePrice({
      snapshot: snapshot({
        messageId: 3,
        date: 300,
        subType: 'shena',
        sideLabel: 'فروش',
      }),
    });

    expect(service.query({ subType: 'shena' }).map((p) => p.messageId)).toEqual(
      [1, 3],
    );
    expect(service.query({ action: 'WE_BUY' }).map((p) => p.messageId)).toEqual(
      [2, 3],
    );
    expect(
      service.query({ action: 'WE_SELL' }).map((p) => p.messageId),
    ).toEqual([1]);
    expect(
      service.query({ from: 150, to: 250 }).map((p) => p.messageId),
    ).toEqual([2]);
    expect(service.query({ limit: 1 }).map((p) => p.messageId)).toEqual([3]);
  });

  it('loads persisted data from Redis on init', async () => {
    // Simulate Redis having data from a previous session
    const p1 = snapshot({
      messageId: 5,
      subType: 'makus',
      deliveryType: 'روز',
    });
    const redis = mockRedis();
    const client = redis.getClient();
    await client.setex(
      `price:${p1.messageId}`,
      3600,
      JSON.stringify({
        date: p1.date,
        messageId: p1.messageId,
        price: p1.price,
        side: p1.sideLabel,
        ourAction: p1.ourAction,
        subType: p1.subType,
        deliveryType: p1.deliveryType,
        quantity: p1.quantity,
      }),
    );
    await client.zadd('price:ids', p1.date, String(p1.messageId));
    await client.sadd('price:filters:subTypes', p1.subType);
    await client.sadd('price:filters:deliveryTypes', p1.deliveryType);

    const reloaded = new PricePersistenceService(redis);
    await reloaded.onModuleInit();

    expect(reloaded.query()).toHaveLength(1);
    const filters = reloaded.filters();
    expect(filters.deliveryTypes).toContain('روز');
    expect(filters.subTypes).toContainEqual({ value: 'makus', label: 'معکوس' });
  });
});
