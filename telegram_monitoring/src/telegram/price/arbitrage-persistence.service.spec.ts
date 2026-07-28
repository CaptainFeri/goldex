import { ArbitragePersistenceService } from './arbitrage-persistence.service';
import {
  ArbitrageOpportunity,
  MITHQALS_PER_KILO,
  PriceSnapshot,
} from './price.types';
import { RedisService } from '../../redis/redis.service';

function mockRedis(): RedisService {
  const store = new Map<string, string>();
  const sorted = new Map<string, Map<string, number>>();
  const client = {
    setex: jest.fn(async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    }),
    mget: jest.fn(async (...keys: string[]) =>
      keys.map((k) => store.get(k) ?? null),
    ),
    zadd: jest.fn(async (key: string, score: number, member: string) => {
      if (!sorted.has(key)) sorted.set(key, new Map());
      sorted.get(key)!.set(member, score);
      return 1;
    }),
    zrange: jest.fn(async (key: string, _min: number, _max: number) => {
      const map = sorted.get(key);
      if (!map) return [];
      return [...map.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    }),
    on: jest.fn(),
    quit: jest.fn(),
  } as any;
  return { getClient: () => client, onModuleDestroy: jest.fn() } as any;
}

function snap(price: number, over?: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    price,
    sideLabel: 'فروش',
    ourAction: 'WE_BUY',
    subType: 'normal',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
    messageId: 0,
    date: 1000,
    categoryKey: 'normal',
    ...over,
  };
}

function opp(
  over: Partial<{
    subType: 'normal' | 'shena' | 'makus';
    buyDate: number;
    sellDate: number;
    spread: number;
    quantity: number;
  }>,
): ArbitrageOpportunity {
  const subType = over.subType ?? 'normal';
  const buyDate = over.buyDate ?? 1000;
  const sellDate = over.sellDate ?? 1001;
  const spread = over.spread ?? 100000;
  const quantity = over.quantity ?? 1;
  return {
    categoryKey: subType,
    subType,
    deliveryType: 'با حواله',
    buy: snap(73_500_000, { date: buyDate, subType, quantity }),
    sell: snap(73_500_000 + spread, {
      date: sellDate,
      subType,
      quantity,
      sideLabel: 'خرید',
      ourAction: 'WE_SELL',
    }),
    spread,
    quantity,
    totalProfit: Math.round(spread * MITHQALS_PER_KILO * quantity),
  };
}

describe('ArbitragePersistenceService', () => {
  let service: ArbitragePersistenceService;

  beforeEach(() => {
    service = new ArbitragePersistenceService(mockRedis());
  });

  function tp(spread: number, qty: number): number {
    return Math.round(spread * MITHQALS_PER_KILO * qty);
  }

  it('sums total cash profit and breaks it down by category', () => {
    service.handleArbitrage(
      opp({
        subType: 'shena',
        buyDate: 100,
        sellDate: 200,
        spread: 100000,
        quantity: 2,
      }),
    );
    service.handleArbitrage(
      opp({
        subType: 'shena',
        buyDate: 200,
        sellDate: 300,
        spread: 90000,
        quantity: 1,
      }),
    );
    service.handleArbitrage(
      opp({
        subType: 'normal',
        buyDate: 300,
        sellDate: 400,
        spread: 120000,
        quantity: 1,
      }),
    );

    const all = service.summary();
    expect(all.count).toBe(3);
    expect(all.totalProfit).toBe(tp(100000, 2) + tp(90000, 1) + tp(120000, 1));
    expect(all.byCategory).toContainEqual({
      subType: 'shena',
      label: 'شنا',
      count: 2,
      totalProfit: tp(100000, 2) + tp(90000, 1),
    });
  });

  it('filters the profit total by date range', () => {
    service.handleArbitrage(
      opp({ buyDate: 100, sellDate: 101, spread: 100000 }),
    );
    service.handleArbitrage(
      opp({ buyDate: 500, sellDate: 501, spread: 100000 }),
    );
    service.handleArbitrage(
      opp({ buyDate: 900, sellDate: 901, spread: 100000 }),
    );

    const mid = service.summary({ from: 200, to: 800 });
    expect(mid.count).toBe(1);
    expect(mid.totalProfit).toBe(tp(100000, 1));
  });

  it('records buyFirst correctly', () => {
    // buy before sell
    const r1 = service.query();
    service.handleArbitrage(opp({ buyDate: 100, sellDate: 200 }));
    expect(service.query()[0].buyFirst).toBe(true);

    // sell before buy
    service.handleArbitrage(opp({ buyDate: 300, sellDate: 250 }));
    expect(service.query()[1].buyFirst).toBe(false);
  });

  it('stores verbose buy/sell details', () => {
    service.handleArbitrage(
      opp({ buyDate: 100, sellDate: 200, spread: 150000, quantity: 3 }),
    );
    const r = service.query()[0];
    expect(r.buy.price).toBe(73500000);
    expect(r.buy.date).toBe(100);
    expect(r.buy.quantity).toBe(3);
    expect(r.buy.sideLabel).toBe('فروش');
    expect(r.sell.price).toBe(73650000);
    expect(r.sell.date).toBe(200);
    expect(r.sell.sideLabel).toBe('خرید');
    expect(r.buyFirst).toBe(true);
  });

  it('computes wallet state from records', () => {
    const buyPrice = 73_500_000;
    const sellPrice = 73_600_000;
    const qty = 2;
    service.handleArbitrage(
      opp({
        buyDate: 100,
        sellDate: 200,
        spread: sellPrice - buyPrice,
        quantity: qty,
      }),
    );
    const w = service.wallet();
    expect(w.totalGoldBought).toBe(qty * 1000);
    expect(w.totalGoldSold).toBe(qty * 1000);
    expect(w.netGold).toBe(0);
    expect(w.totalCashSpent).toBeCloseTo(
      Math.round(buyPrice * MITHQALS_PER_KILO * qty),
      -1,
    );
    expect(w.totalCashReceived).toBeCloseTo(
      Math.round(sellPrice * MITHQALS_PER_KILO * qty),
      -1,
    );
    expect(w.netCash).toBeCloseTo(service.summary().totalProfit, -1);
  });

  it('loads persisted data from Redis on init', async () => {
    const redis = mockRedis();
    const client = redis.getClient();
    await client.setex(
      'arbitrage:1',
      3600,
      JSON.stringify({
        date: 200,
        subType: 'normal',
        deliveryType: 'با حواله',
        buyAt: 73500000,
        sellAt: 73600000,
        spread: 100000,
        quantity: 1,
        totalProfit: 100000,
        buyFirst: true,
        buy: {
          price: 73500000,
          messageId: 1,
          date: 100,
          quantity: 1,
          sideLabel: 'فروش',
          ourAction: 'WE_BUY',
        },
        sell: {
          price: 73600000,
          messageId: 2,
          date: 200,
          quantity: 1,
          sideLabel: 'خرید',
          ourAction: 'WE_SELL',
        },
      }),
    );
    await client.zadd('arbitrage:ids', 200, '1');

    const reloaded = new ArbitragePersistenceService(redis);
    await reloaded.onModuleInit();
    expect(reloaded.query()).toHaveLength(1);
    expect(reloaded.query()[0].buyFirst).toBe(true);
    expect(reloaded.query()[0].buy.sideLabel).toBe('فروش');
    expect(reloaded.summary().totalProfit).toBe(100000);
  });
});
