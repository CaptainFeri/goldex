import { RedisService } from '../../redis/redis.service';
import { TelegramService } from '../telegram.service';
import { ChartImageService } from '../price/chart-image.service';
import { MITHQALS_PER_KILO } from '../price/price.types';
import type {
  ArbitrageOpportunity,
  MarketOpportunity,
  PriceSnapshot,
} from '../price/price.types';
import { WalletService } from './wallet.service';
import { kgToMesqal } from './wallet-report.formatter';
import type { TradeRecord } from './wallet.types';

/** Exposes private rebalance internals for tests. */
type RebalanceInternals = {
  rebalanceTrades(): TradeRecord[];
  rebalance(): Promise<void>;
  irrBalance: number;
};

const rebalanceInternals = (s: WalletService): RebalanceInternals =>
  s as unknown as RebalanceInternals;

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
    sendWalletStatusReport: jest.fn(async () => {}),
  } as any;
}

function mockChartImage(
  over: Partial<ChartImageService> = {},
): ChartImageService {
  return {
    renderWalletChart: jest.fn(async () => Buffer.from('png-image')),
    ...over,
  } as any;
}

const amount = (price: number, kg: number) =>
  Math.round(kgToMesqal(kg) * price);

const sellAmount = (price: number, kg: number) =>
  Math.round(price * MITHQALS_PER_KILO * kg);

const arbitrageProfit = (buy: number, sell: number, kg: number) =>
  amount(sell, kg) - amount(buy, kg);

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
    totalProfit: arbitrageProfit(buyPrice, sellPrice, quantity),
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
    service = new WalletService(mockRedis(), mockTelegram(), mockChartImage());
  });

  it('starts with a 100B IRR pool and no symbol wallets', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(100_000_000_000);
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
      profit: arbitrageProfit(73_500_000, 73_600_000, 1),
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(
      100_000_000_000 + arbitrageProfit(73_500_000, 73_600_000, 1),
    );
    expect(snapshot.totalRealizedProfit).toBe(
      arbitrageProfit(73_500_000, 73_600_000, 1),
    );
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
    expect(service.getSnapshot().irrBalance).toBe(100_000_000_000);
    expect(service.getTrades({ executed: true })).toHaveLength(0);
  });

  it('executes a cash-funded arbitrage even with zero gold inventory', () => {
    const seedSell = service.executeMarketMaker(
      marketOpportunity(40_000_000, 'WE_SELL', 1),
    );
    expect(seedSell?.executed).toBe(true);
    expect(seedSell?.profit).toBe(0);
    expect(service.getSnapshot().symbols[0].goldKg).toBe(0);

    const trades = service.executeArbitrage(
      arbitrageOpportunity(40_000_000, 40_100_000, 2),
    );

    expect(trades.map((t) => t.executed)).toEqual([true, true]);
    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(0);
    expect(snapshot.irrBalance).toBe(
      100_000_000_000 +
        sellAmount(40_000_000, 1) +
        arbitrageProfit(40_000_000, 40_100_000, 2),
    );
    expect(snapshot.totalRealizedProfit).toBe(
      arbitrageProfit(40_000_000, 40_100_000, 2),
    );
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
    expect(snapshot.irrBalance).toBe(100_000_000_000 - amount(73_500_000, 1));
    expect(snapshot.symbols[0]).toMatchObject({
      goldKg: 2,
      lots: [
        { pricePerKg: 0, qtyKg: 1 },
        { pricePerKg: amount(73_500_000, 1), qtyKg: 1 },
      ],
    });
  });

  it('charges the free seed gold at the sale price, so selling it books no profit', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(74_000_000, 'WE_SELL'),
    );

    expect(trade).toMatchObject({
      executed: true,
      side: 'SELL',
      profit: 0,
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(0);
    expect(snapshot.irrBalance).toBe(
      100_000_000_000 + sellAmount(74_000_000, 1),
    );
    expect(snapshot.totalRealizedProfit).toBe(0);
  });

  it('sells gold FIFO (oldest free seed lot first) and only books profit on real buys', () => {
    service.executeMarketMaker(marketOpportunity(73_500_000, 'WE_BUY'));
    const trade = service.executeMarketMaker(
      marketOpportunity(74_000_000, 'WE_SELL'),
    );

    expect(trade).toMatchObject({
      executed: true,
      side: 'SELL',
      profit: 0,
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(1);
    expect(snapshot.symbols[0].lots).toHaveLength(1);
    expect(snapshot.symbols[0].lots[0].pricePerKg).toBe(amount(73_500_000, 1));
    expect(snapshot.irrBalance).toBe(
      100_000_000_000 + sellAmount(74_000_000, 1) - amount(73_500_000, 1),
    );
    expect(snapshot.totalRealizedProfit).toBe(0);
  });

  it('never sells at a loss once the free seed lot is consumed (FIFO guard)', () => {
    service.executeMarketMaker(marketOpportunity(75_000_000, 'WE_BUY'));
    const seedSell = service.executeMarketMaker(
      marketOpportunity(73_000_000, 'WE_SELL'),
    );
    expect(seedSell?.executed).toBe(true);

    service.executeMarketMaker(marketOpportunity(75_000_000, 'WE_BUY'));
    const trade = service.executeMarketMaker(
      marketOpportunity(73_000_000, 'WE_SELL'),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('بهای');
    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(2);
  });

  it('skips a WE_SELL when there is not enough gold inventory', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(74_000_000, 'WE_SELL', 2),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('طلا');
    expect(service.getSnapshot().irrBalance).toBe(100_000_000_000);
  });

  it('sizes a WE_BUY down when the full quantity is not affordable', () => {
    const trade = service.executeMarketMaker(
      marketOpportunity(73_500_000, 'WE_BUY', 5),
    );

    expect(trade).toMatchObject({
      executed: true,
      side: 'BUY',
      quantityKg: 4,
      amount: amount(73_500_000, 4),
    });

    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(5);
    expect(snapshot.irrBalance).toBe(100_000_000_000 - amount(73_500_000, 4));
  });

  it('skips a WE_BUY when even the minimum kg exceeds the reserve-protected budget', () => {
    service.executeMarketMaker(marketOpportunity(73_500_000, 'WE_BUY', 5));
    const trade = service.executeMarketMaker(
      marketOpportunity(73_500_000, 'WE_BUY', 1),
    );

    expect(trade?.executed).toBe(false);
    expect(trade?.reason).toContain('ریال');
    expect(trade?.reason).toContain('ذخیره');
    const snapshot = service.getSnapshot();
    expect(snapshot.symbols[0].goldKg).toBe(5);
    expect(snapshot.buyingPower).toBeLessThan(amount(73_500_000, 1));
  });

  it('keeps a cash reserve and exposes equity/buying power in the snapshot', () => {
    const before = service.getSnapshot();
    expect(before.equity).toBe(100_000_000_000);
    expect(before.cashReserve).toBe(20_000_000_000);
    expect(before.buyingPower).toBe(80_000_000_000);

    service.executeMarketMaker(marketOpportunity(73_500_000, 'WE_BUY', 5));
    const after = service.getSnapshot();
    expect(after.equity).toBeCloseTo(100_000_000_000, -5);
    expect(after.cashReserve).toBeCloseTo(20_000_000_000, -5);
    expect(after.buyingPower).toBeCloseTo(
      100_000_000_000 - amount(73_500_000, 4) - 20_000_000_000,
      -5,
    );
  });

  it('sizes an arbitrage round trip down to the affordable quantity', () => {
    const trades = service.executeArbitrage(
      arbitrageOpportunity(73_500_000, 73_600_000, 5),
    );

    expect(trades.map((t) => t.executed)).toEqual([true, true]);
    expect(trades.map((t) => t.quantityKg)).toEqual([4, 4]);
    expect(trades[0].amount).toBe(amount(73_500_000, 4));
    expect(trades[1].profit).toBe(arbitrageProfit(73_500_000, 73_600_000, 4));

    const snapshot = service.getSnapshot();
    expect(snapshot.irrBalance).toBe(
      100_000_000_000 + arbitrageProfit(73_500_000, 73_600_000, 4),
    );
    expect(snapshot.symbols[0].goldKg).toBe(1);
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
    const withTelegram = new WalletService(
      mockRedis(),
      telegram,
      mockChartImage(),
    );

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
    const withTelegram = new WalletService(
      mockRedis(),
      telegram,
      mockChartImage(),
    );

    withTelegram.handleArbitrage(
      arbitrageOpportunity(73_500_000_000, 73_600_000_000),
    );

    expect(telegram.sendWalletReport).not.toHaveBeenCalled();
  });

  it('publishes the overall wallet status report every minute', async () => {
    jest.useFakeTimers();
    try {
      const telegram = mockTelegram();
      const withTelegram = new WalletService(
        mockRedis(),
        telegram,
        mockChartImage(),
      );
      await withTelegram.onModuleInit();

      withTelegram.handleMarketOpportunity(
        marketOpportunity(73_500_000, 'WE_BUY'),
      );
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(1);

      // First status tick has a single history sample -> text-only report.
      await jest.advanceTimersByTimeAsync(60_000);
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(2);
      const status = (telegram.sendWalletReport as jest.Mock).mock
        .calls[1][0] as string;
      expect(status).toContain('وضعیت کیف پول ربات');
      expect(status).toContain('موجودی ریال');
      expect(status).toContain('با حواله');
      expect(status).toContain('سود کل تحقق');

      // Second tick has two samples -> status sent with an assets chart.
      await jest.advanceTimersByTimeAsync(60_000);
      expect(telegram.sendWalletStatusReport).toHaveBeenCalledTimes(1);
      const [caption, image] = (telegram.sendWalletStatusReport as jest.Mock)
        .mock.calls[0];
      expect(Buffer.isBuffer(image)).toBe(true);
      expect(caption).toContain('وضعیت کیف پول ربات');
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to text-only status when the assets chart cannot be generated', async () => {
    jest.useFakeTimers();
    try {
      const telegram = mockTelegram();
      const chart = mockChartImage({
        renderWalletChart: jest.fn(async () => {
          throw new Error('QuickChart down');
        }),
      });
      const withTelegram = new WalletService(mockRedis(), telegram, chart);
      await withTelegram.onModuleInit();

      await jest.advanceTimersByTimeAsync(60_000);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(telegram.sendWalletStatusReport).not.toHaveBeenCalled();
      expect(telegram.sendWalletReport).toHaveBeenCalledTimes(2);
      const status = (telegram.sendWalletReport as jest.Mock).mock
        .calls[1][0] as string;
      expect(status).toContain('وضعیت کیف پول ربات');
    } finally {
      jest.useRealTimers();
    }
  });

  it('status report shows a zero-profit state before any trade', async () => {
    jest.useFakeTimers();
    try {
      const telegram = mockTelegram();
      const withTelegram = new WalletService(
        mockRedis(),
        telegram,
        mockChartImage(),
      );
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

  it('rebalances by buying gold when the wallet is cash-heavy', () => {
    service.handleMarketOpportunity(marketOpportunity(73_500_000, 'WE_BUY'));
    const before = service.getSnapshot();

    const trades = rebalanceInternals(service).rebalanceTrades();

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      source: 'REBALANCE',
      side: 'BUY',
      executed: true,
      symbol: 'با حواله',
    });

    const after = service.getSnapshot();
    expect(after.irrBalance).toBe(before.irrBalance - amount(73_500_000, 1));
    expect(after.symbols[0].goldKg).toBe(3);
    expect(service.getTrades({ source: 'REBALANCE' })).toHaveLength(1);
  });

  it('rebalances by selling gold when the wallet is gold-heavy, respecting the no-loss rule', () => {
    service.handleMarketOpportunity(marketOpportunity(75_000_000, 'WE_BUY', 5));
    const before = service.getSnapshot();
    expect(before.symbols[0].goldKg).toBe(5);

    const trades = rebalanceInternals(service).rebalanceTrades();

    // One kg covers the shortfall; FIFO consumes the free seed lot first,
    // so the sell books no profit (paid lots stay untouched).
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      source: 'REBALANCE',
      side: 'SELL',
      quantityKg: 1,
      profit: 0,
      executed: true,
    });

    const after = service.getSnapshot();
    expect(after.symbols[0].goldKg).toBe(4);
    expect(after.symbols[0].lots.every((l) => l.pricePerKg > 0)).toBe(true);
    expect(after.irrBalance).toBe(before.irrBalance + amount(75_000_000, 1));
    expect(after.totalRealizedProfit).toBe(0);
  });

  it('skips rebalancing when the imbalance is within the tolerance band', () => {
    service.handleMarketOpportunity(marketOpportunity(73_500_000, 'WE_BUY'));
    // Cash equal to the gold value -> gap of zero vs. the 50% target.
    const goldValue = 2 * 73_500_000 * MITHQALS_PER_KILO;
    rebalanceInternals(service).irrBalance = Math.round(goldValue);

    const trades = rebalanceInternals(service).rebalanceTrades();

    expect(trades).toHaveLength(0);
    expect(service.getTrades({ source: 'REBALANCE' })).toHaveLength(0);
  });

  it('skips rebalancing when no symbol has a price yet', () => {
    const trades = rebalanceInternals(service).rebalanceTrades();

    expect(trades).toHaveLength(0);
    expect(service.getTrades()).toHaveLength(0);
  });

  it('never rebalances into the cash reserve', () => {
    service.handleMarketOpportunity(marketOpportunity(73_500_000, 'WE_BUY'));
    const snapshot = service.getSnapshot();
    const reserve = Math.round(snapshot.equity * 0.2);

    rebalanceInternals(service).rebalanceTrades();

    expect(service.getSnapshot().irrBalance).toBeGreaterThan(reserve);
  });

  it('publishes a rebalance report to the report channel when trades execute', async () => {
    const telegram = mockTelegram();
    const withTelegram = new WalletService(
      mockRedis(),
      telegram,
      mockChartImage(),
    );
    withTelegram.handleMarketOpportunity(
      marketOpportunity(73_500_000, 'WE_BUY'),
    );
    expect(telegram.sendWalletReport).toHaveBeenCalledTimes(1);

    await rebalanceInternals(withTelegram).rebalance();

    expect(telegram.sendWalletReport).toHaveBeenCalledTimes(2);
    const report = (telegram.sendWalletReport as jest.Mock).mock
      .calls[1][0] as string;
    expect(report).toContain('تعادل دارایی');
    expect(report).toContain('خرید');
  });
});
