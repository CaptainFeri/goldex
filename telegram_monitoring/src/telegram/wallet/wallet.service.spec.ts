import { RedisService } from '../../redis/redis.service';
import { TelegramService } from '../telegram.service';
import { MITHQALS_PER_KILO } from '../price/price.types';
import type {
  ArbitrageOpportunity,
  MarketOpportunity,
  PriceSnapshot,
} from '../price/price.types';
import { WalletService } from './wallet.service';

function mockRedis(): RedisService {
  const client = {
    set: jest.fn(async () => 'OK'),
    setex: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    mget: jest.fn(async () => []),
    zadd: jest.fn(async () => 1),
    zrange: jest.fn(async () => []),
    on: jest.fn(),
    quit: jest.fn(),
  } as any;
  return { getClient: () => client } as any;
}

function mockTelegram(): TelegramService {
  return {
    sendWalletReport: jest.fn(async () => {}),
  } as any;
}

const amount = (price: number, kg: number) =>
  Math.round(price * MITHQALS_PER_KILO * kg);

const profit = (spread: number, kg: number) =>
  Math.round(spread * MITHQALS_PER_KILO * kg);

function snapshot(price: number, side: 'خرید' | 'فروش'): PriceSnapshot {
  return {
    price,
    sideLabel: side,
    ourAction: side === 'خرید' ? 'WE_SELL' : 'WE_BUY',
    subType: 'normal',
    deliveryType: 'با حواله',
    quantity: 1,
    messageId: 1,
    date: 1000,
    categoryKey: 'normal',
    raw: '',
  };
}

function arbitrageOpportunity(
  buyPrice: number,
  sellPrice: number,
  quantity = 1,
): ArbitrageOpportunity {
  return {
    categoryKey: 'normal',
    subType: 'normal',
    deliveryType: 'با حواله',
    buy: snapshot(buyPrice, 'فروش'),
    sell: snapshot(sellPrice, 'خرید'),
    spread: sellPrice - buyPrice,
    quantity,
    totalProfit: profit(sellPrice - buyPrice, quantity),
  };
}

function marketOpportunity(
  price: number,
  ourAction: 'WE_BUY' | 'WE_SELL',
  quantity = 1,
): MarketOpportunity {
  return {
    type: 'BEST_PRICE',
    subType: 'normal',
    deliveryType: 'با حواله',
    direction: ourAction === 'WE_BUY' ? 'DOWN' : 'UP',
    ourAction,
    price,
    previousPrice: price,
    changePercent: 0,
    messageId: 1,
    date: 1000,
    quantity,
  };
}

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    service = new WalletService(mockRedis(), mockTelegram());
  });

  it('starts with a 20B IRR pool and no symbol wallets', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(20_000_000_000);
    expect(snapshot.totalRealizedProfit).toBe(0);
    expect(snapshot.symbols).toEqual([]);
  });

  it('executes a profitable arbitrage round trip without changing gold', () => {
    const trades = service.executeArbitrage(
      arbitrageOpportunity(73_500_000, 73_600_000),
    );

    expect(trades).toHaveLength(2);
    expect(trades.map((t) => t.executed)).toEqual([true, true]);
    expect(trades[0]).toMatchObject({
      source: 'ARBITRAGE',
      side: 'BUY',
      price: 73_500_000,
      quantityKg: 1,
      amount: amount(73_500_000, 1),
      profit: 0,
    });
    expect(trades[1]).toMatchObject({
      side: 'SELL',
      amount: amount(73_600_000, 1),
      profit: profit(100_000, 1),
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(20_000_000_000 + profit(100_000, 1));
    expect(snapshot.totalRealizedProfit).toBe(profit(100_000, 1));
    expect(snapshot.symbols[0]).toMatchObject({
      symbol: 'با حواله',
      goldKg: 1,
    });
    expect(snapshot.trades).toHaveLength(2);
  });

  it('skips an arbitrage when the IRR pool cannot cover the buy leg', () => {
    const trades = service.executeArbitrage(
      arbitrageOpportunity(73_500_000_000, 73_600_000_000),
    );

    expect(trades.map((t) => t.executed)).toEqual([false, false]);
    expect(trades[0].reason).toContain('ریال');
    expect(service.getSnapshot().irrBalance).toBe(20_000_000_000);
    expect(service.getTrades({ executed: true })).toHaveLength(0);
  });

  it('skips an arbitrage when the gold balance cannot cover the sell leg', () => {
    const trades = service.executeArbitrage(
      arbitrageOpportunity(30_000_000, 30_100_000, 2),
    );

    expect(trades.map((t) => t.executed)).toEqual([false, false]);
    expect(trades[0].reason).toContain('طلا');
    expect(service.getSnapshot().symbols[0].goldKg).toBe(1);
  });

  it('buys gold on a WE_BUY market maker signal when affordable', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(73_500_000, 'WE_BUY'),
    );

    expect(trade).toMatchObject({
      executed: true,
      side: 'BUY',
      amount: amount(73_500_000, 1),
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(20_000_000_000 - amount(73_500_000, 1));
    expect(snapshot.symbols[0]).toMatchObject({
      goldKg: 2,
      avgCostKg: amount(73_500_000, 1),
    });
  });

  it('sells gold and realizes profit on a WE_SELL signal above average cost', () => {
    service.executeMarketMaker(marketOpportunity(73_500_000, 'WE_BUY'));
    const trade = service.executeMarketMaker(
      marketOpportunity(74_000_000, 'WE_SELL'),
    );

    expect(trade).toMatchObject({
      executed: true,
      side: 'SELL',
      profit: profit(500_000, 1),
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(1);
    expect(snapshot.irrBalance).toBe(20_000_000_000 + profit(500_000, 1));
    expect(snapshot.totalRealizedProfit).toBe(profit(500_000, 1));
  });

  it('never sells at a loss (price below average cost)', () => {
    service.executeMarketMaker(marketOpportunity(75_000_000, 'WE_BUY'));
    const trade = service.executeMarketMaker(
      marketOpportunity(73_000_000, 'WE_SELL'),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('میانگین');
    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(2);
    expect(snapshot.irrBalance).toBe(20_000_000_000 - amount(75_000_000, 1));
  });

  it('skips a WE_SELL when there is not enough gold inventory', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(74_000_000, 'WE_SELL', 2),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('طلا');
    expect(service.getSnapshot().irrBalance).toBe(20_000_000_000);
  });

  it('skips a WE_BUY when the IRR pool cannot afford it', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(73_500_000, 'WE_BUY', 10),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('ریال');
    expect(service.getSnapshot().symbols[0].goldKg).toBe(1);
  });

  it('ignores non-normal (shena/makus) signals entirely', () => {
    const arb = arbitrageOpportunity(73_500_000, 73_600_000);
    arb.subType = 'shena';
    service.handleArbitrage(arb);

    const mm = marketOpportunity(74_000_000, 'WE_BUY');
    mm.subType = 'makus';
    service.handleMarketOpportunity(mm);

    expect(service.getTrades()).toHaveLength(0);
    expect(service.getSnapshot().symbols).toEqual([]);
  });

  it('publishes a wallet report to the report channel after execution', () => {
    const telegram = mockTelegram();
    const withTelegram = new WalletService(mockRedis(), telegram);

    withTelegram.handleMarketOpportunity(
      marketOpportunity(73_500_000, 'WE_BUY'),
    );

    expect(telegram.sendWalletReport).toHaveBeenCalledTimes(1);
    const report = (telegram.sendWalletReport as jest.Mock).mock
      .calls[0][0] as string;
    expect(report).toContain('گزارش ربات');
    expect(report).toContain('با حواله');
    expect(report).toContain('خرید');
  });

  it('does not publish reports for skipped trades', () => {
    const telegram = mockTelegram();
    const withTelegram = new WalletService(mockRedis(), telegram);

    withTelegram.handleArbitrage(
      arbitrageOpportunity(73_500_000_000, 73_600_000_000),
    );

    expect(telegram.sendWalletReport).not.toHaveBeenCalled();
  });

  it('publishes the overall wallet status report every minute', async () => {
    jest.useFakeTimers();
    try {
      const telegram = mockTelegram();
      const withTelegram = new WalletService(mockRedis(), telegram);
      await withTelegram.onModuleInit();

      withTelegram.handleMarketOpportunity(
        marketOpportunity(73_500_000, 'WE_BUY'),
      );
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(60_000);
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(2);
      const status = (telegram.sendWalletReport as jest.Mock).mock
        .calls[1][0] as string;
      expect(status).toContain('وضعیت کیف پول ربات');
      expect(status).toContain('موجودی ریال');
      expect(status).toContain('با حواله');
      expect(status).toContain('سود کل تحقق');

      jest.advanceTimersByTime(60_000);
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('status report shows a zero-profit state before any trade', async () => {
    jest.useFakeTimers();
    try {
      const telegram = mockTelegram();
      const withTelegram = new WalletService(mockRedis(), telegram);
      await withTelegram.onModuleInit();

      jest.advanceTimersByTime(60_000);
      const status = (telegram.sendWalletReport as jest.Mock).mock
        .calls[0][0] as string;
      expect(status).toContain('هنوز نمادی دیده نشده');
      expect(status).toContain('0');
    } finally {
      jest.useRealTimers();
    }
  });
});
