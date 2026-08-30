import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MarketMakerService } from '../src/telegram/price/market-maker.service';
import { TelegramService } from '../src/telegram/telegram.service';
import type {
  ArbitrageOpportunity,
  PriceSnapshot,
} from '../src/telegram/price/price.types';

/**
 * TelegramService is replaced with a stub: the e2e suite drives the pipeline
 * through in-process EventEmitter2 events and HTTP requests, so no real
 * Telegram connection (or its multi-second retry window) is needed.
 */
class TelegramServiceStub {
  getAuthState() {
    return { state: 'ready' as const };
  }
  submitCode() {
    return { success: true };
  }
  submitPassword() {
    return { success: true };
  }
  async resendCode() {
    return null;
  }
  async retryConnection() {
    return false;
  }
  getSessionString() {
    return null;
  }
  async importSession() {
    return false;
  }
  sendWalletReport() {
    return Promise.resolve();
  }
  sendWalletStatusReport() {
    return Promise.resolve();
  }
  sendWalletExcelFile() {
    return Promise.resolve();
  }
  sendWalletExcelToTarget() {
    return Promise.resolve();
  }
}

const REDIS_HOST = 'localhost';
const REDIS_PORT = 56179;

function makePriceSnapshot(overrides: Partial<PriceSnapshot> = {}): PriceSnapshot {
  return {
    messageId: 7001,
    date: Math.floor(Date.now() / 1000),
    price: 15_000_000,
    sideLabel: 'خرید' as PriceSnapshot['sideLabel'],
    ourAction: 'WE_BUY',
    subType: 'normal',
    deliveryType: 'e2e-delivery',
    quantity: 2,
    description: 'e2e price point',
    raw: 'e2e snapshot',
    categoryKey: 'e2e',
    ...overrides,
  };
}

function makeArbitrageOpportunity(
  overrides: Partial<ArbitrageOpportunity> = {},
): ArbitrageOpportunity {
  const now = Math.floor(Date.now() / 1000);
  return {
    categoryKey: 'e2e',
    subType: 'normal',
    deliveryType: 'e2e-delivery',
    buy: {
      ...makePriceSnapshot({
        messageId: 8001,
        date: now,
        price: 15_000_000,
        ourAction: 'WE_BUY',
        sideLabel: 'خرید' as PriceSnapshot['sideLabel'],
      }),
    },
    sell: {
      ...makePriceSnapshot({
        messageId: 8002,
        date: now + 1,
        price: 15_050_000,
        ourAction: 'WE_SELL',
        sideLabel: 'فروش' as PriceSnapshot['sideLabel'],
      }),
    },
    spread: 50_000,
    quantity: 1,
    totalProfit: 50_000,
    ...overrides,
  };
}

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('telegram_monitoring (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let emitter: EventEmitter2;
  let redis: Redis;
  let marketMaker: MarketMakerService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramService)
      .useValue(new TelegramServiceStub())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    http = request(app.getHttpServer());
    emitter = app.get(EventEmitter2);
    redis = app.get(RedisService).getClient();
    marketMaker = app.get(MarketMakerService);
  }, 60000);

  afterAll(async () => {
    await app?.close();
  });

  describe('bootstrap & public surface', () => {
    it('exposes the auth status endpoint (stubbed Telegram client)', async () => {
      const res = await http.get('/api/auth/status').expect(200);
      expect(res.body.state).toBe('ready');
    });

    it('rejects an auth code request without a body', async () => {
      const res = await http.post('/api/auth/code').send({}).expect(400);
      expect(res.body.message).toContain('code is required');
    });
  });

  describe('empty-state API responses', () => {
    it('GET /api/prices returns an empty list', async () => {
      const res = await http.get('/api/prices').expect(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/prices/filters returns empty facets', async () => {
      const res = await http.get('/api/prices/filters').expect(200);
      expect(res.body).toEqual({ subTypes: [], deliveryTypes: [] });
    });

    it('GET /api/wallet returns the initial cash-only snapshot', async () => {
      const res = await http.get('/api/wallet').expect(200);
      expect(res.body.irrBalance).toBe(100_000_000_000);
      expect(res.body.totalRealizedProfit).toBe(0);
      expect(res.body.symbols).toEqual([]);
    });

    it('GET /api/wallet/symbols and /api/wallet/trades return empty arrays', async () => {
      await http.get('/api/wallet/symbols').expect(200, []);
      await http.get('/api/wallet/trades').expect(200, []);
    });

    it('GET /api/arbitrages returns an empty list', async () => {
      await http.get('/api/arbitrages').expect(200, []);
    });

    it('GET /api/arbitrages/wallet returns a zeroed wallet', async () => {
      const res = await http.get('/api/arbitrages/wallet').expect(200);
      expect(res.body).toEqual({
        totalGoldBought: 0,
        totalGoldSold: 0,
        netGold: 0,
        totalCashSpent: 0,
        totalCashReceived: 0,
        netCash: 0,
      });
    });

    it('GET /api/arbitrages/summary returns an empty summary', async () => {
      const res = await http.get('/api/arbitrages/summary').expect(200);
      expect(res.body).toEqual({ count: 0, totalProfit: 0, byCategory: [] });
    });

    it('GET /api/market endpoints return empty lists', async () => {
      await http.get('/api/market').expect(200, []);
      await http.get('/api/market/best-buys').expect(200, []);
      await http.get('/api/market/best-sells').expect(200, []);
    });

    it('GET /api/opportunities returns an empty list and summary', async () => {
      await http.get('/api/opportunities').expect(200, []);
      const summary = await http.get('/api/opportunities/summary').expect(200);
      expect(summary.body.count).toBe(0);
    });
  });

  describe('price ingestion (telegram.price event)', () => {
    const snapshot = makePriceSnapshot();

    it('persists the emitted price point to memory, HTTP and Redis', async () => {
      emitter.emit('telegram.price', { snapshot });

      const res = await http.get('/api/prices').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        messageId: snapshot.messageId,
        price: snapshot.price,
        subType: 'normal',
        deliveryType: 'e2e-delivery',
      });

      await waitFor(async () => (await redis.exists(`price:${snapshot.messageId}`)) === 1);
      const raw = await redis.get(`price:${snapshot.messageId}`);
      const stored = JSON.parse(raw!);
      expect(stored.ourAction).toBe('WE_BUY');
    });

    it('exposes the facets collected from stored points', async () => {
      const res = await http.get('/api/prices/filters').expect(200);
      expect(res.body.deliveryTypes).toContain('e2e-delivery');
      expect(res.body.subTypes.map((s: { value: string }) => s.value)).toContain('normal');
    });

    it('filters prices by subType and action', async () => {
      const filtered = await http
        .get('/api/prices?subType=normal&action=WE_BUY')
        .expect(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0].ourAction).toBe('WE_BUY');

      const none = await http
        .get('/api/prices?subType=shena')
        .expect(200);
      expect(none.body).toEqual([]);
    });
  });

  describe('arbitrage ingestion (telegram.arbitrage event)', () => {
    const opportunity = makeArbitrageOpportunity();

    it('records and persists the arbitrage opportunity', async () => {
      emitter.emit('telegram.arbitrage', opportunity);

      await waitFor(async () => (await redis.zcard('arbitrage:ids')) >= 1);

      const res = await http.get('/api/arbitrages').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        subType: 'normal',
        deliveryType: 'e2e-delivery',
        buyAt: 15_000_000,
        sellAt: 15_050_000,
        spread: 50_000,
        totalProfit: 50_000,
      });

      const summary = await http.get('/api/arbitrages/summary').expect(200);
      expect(summary.body.count).toBe(1);
      expect(summary.body.totalProfit).toBe(50_000);

      const wallet = await http.get('/api/arbitrages/wallet').expect(200);
      expect(wallet.body.totalGoldBought).toBeGreaterThan(0);
      expect(wallet.body.netCash).toBeGreaterThan(0);
    });

    it('supports date-range filtering on the arbitrage list', async () => {
      const res = await http
        .get(`/api/arbitrages?from=${opportunity.buy.date - 1}&to=${opportunity.buy.date + 1}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('paper wallet trading', () => {
    it('executes a round-trip arbitrage trade against the wallet', async () => {
      emitter.emit('telegram.arbitrage', makeArbitrageOpportunity());

      await waitFor(async () => {
        const trades = await http.get('/api/wallet/trades');
        return trades.body.some((t: { executed: boolean }) => t.executed);
      });

      const trades = await http.get('/api/wallet/trades').expect(200);
      const executed = trades.body.filter((t: { executed: boolean }) => t.executed);
      expect(executed.length).toBeGreaterThanOrEqual(2);
      const sides = new Set(executed.map((t: { side: string }) => t.side));
      expect(sides).toEqual(new Set(['BUY', 'SELL']));
      expect(executed.every((t: { source: string }) => t.source === 'ARBITRAGE')).toBe(true);

      const snapshot = await http.get('/api/wallet').expect(200);
      expect(snapshot.body.symbols.length).toBe(1);
      expect(snapshot.body.symbols[0].symbol).toBe('e2e-delivery');
      expect(snapshot.body.irrBalance).toBeGreaterThan(100_000_000_000);

      await waitFor(async () => (await redis.exists('wallet:state')) === 1);
      const state = JSON.parse((await redis.get('wallet:state'))!);
      expect(state.irrBalance).toBe(snapshot.body.irrBalance);
    });

    it('filters trades by execution status', async () => {
      const executed = await http.get('/api/wallet/trades?executed=true').expect(200);
      expect(executed.body.length).toBeGreaterThan(0);
      expect(executed.body.every((t: { executed: boolean }) => t.executed)).toBe(true);
    });
  });

  describe('market maker (onPrice integration)', () => {
    it('builds a market state and emits a price-movement opportunity', async () => {
      // Market-maker ignores any price that carries a description (custom deals)
      const first = makePriceSnapshot({
        messageId: 9001,
        price: 10_000_000,
        ourAction: 'WE_SELL',
        description: undefined,
      });
      marketMaker.onPrice(first, first);

      const second = makePriceSnapshot({
        messageId: 9002,
        price: 10_060_000,
        ourAction: 'WE_SELL',
        description: undefined,
      });
      marketMaker.onPrice(second, second);

      const market = await http.get('/api/market?subType=normal').expect(200);
      const state = market.body.find((m: { deliveryType: string }) => m.deliveryType === 'e2e-delivery');
      expect(state).toBeDefined();
      expect(state.lastPrice).toBe(10_060_000);
      expect(Math.abs(state.priceChangePercent)).toBeGreaterThan(0.5);

      await waitFor(async () => (await redis.zcard('opportunity:ids')) >= 1);

      const opportunities = await http.get('/api/opportunities').expect(200);
      const movement = opportunities.body.filter(
        (o: { type: string }) => o.type === 'PRICE_MOVEMENT',
      );
      expect(movement.length).toBeGreaterThanOrEqual(1);
      expect(movement[0].price).toBe(10_060_000);
    });

    it('ranks best buys and best sells', async () => {
      const bestBuys = await http.get('/api/market/best-buys').expect(200);
      const bestSells = await http.get('/api/market/best-sells').expect(200);
      expect(Array.isArray(bestBuys.body)).toBe(true);
      expect(Array.isArray(bestSells.body)).toBe(true);
    });
  });
});
