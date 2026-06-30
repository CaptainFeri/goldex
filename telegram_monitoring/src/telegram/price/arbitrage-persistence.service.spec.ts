import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ArbitragePersistenceService } from './arbitrage-persistence.service';
import { ArbitrageOpportunity, PriceSnapshot } from './price.types';

function opp(
  over: Partial<{
    subType: 'normal' | 'shena' | 'makus';
    date: number;
    spread: number;
    quantity: number;
  }>,
): ArbitrageOpportunity {
  const subType = over.subType ?? 'normal';
  const date = over.date ?? 1000;
  const spread = over.spread ?? 100000;
  const quantity = over.quantity ?? 1;
  const snap = (price: number): PriceSnapshot => ({
    price,
    sideLabel: 'فروش',
    ourAction: 'WE_BUY',
    subType,
    deliveryType: 'با حواله',
    quantity,
    raw: '',
    messageId: 0,
    date,
    categoryKey: subType,
  });
  return {
    categoryKey: subType,
    subType,
    deliveryType: 'با حواله',
    buy: snap(73_500_000),
    sell: snap(73_500_000 + spread),
    spread,
    quantity,
    totalProfit: spread * quantity,
  };
}

describe('ArbitragePersistenceService', () => {
  let service: ArbitragePersistenceService;

  beforeEach(() => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'arb-')),
      'a.jsonl',
    );
    process.env.ARBITRAGE_DATA_FILE = file;
    service = new ArbitragePersistenceService();
    service.onModuleInit();
  });

  afterEach(() => delete process.env.ARBITRAGE_DATA_FILE);

  it('sums total cash profit and breaks it down by category', () => {
    service.handleArbitrage(opp({ subType: 'shena', date: 100, spread: 100000, quantity: 2 }));
    service.handleArbitrage(opp({ subType: 'shena', date: 200, spread: 90000, quantity: 1 }));
    service.handleArbitrage(opp({ subType: 'normal', date: 300, spread: 120000, quantity: 1 }));

    const all = service.summary();
    expect(all.count).toBe(3);
    expect(all.totalProfit).toBe(200000 + 90000 + 120000);
    expect(all.byCategory).toContainEqual({
      subType: 'shena',
      label: 'شنا',
      count: 2,
      totalProfit: 290000,
    });
  });

  it('filters the profit total by date range', () => {
    service.handleArbitrage(opp({ date: 100, spread: 100000 }));
    service.handleArbitrage(opp({ date: 500, spread: 100000 }));
    service.handleArbitrage(opp({ date: 900, spread: 100000 }));

    const mid = service.summary({ from: 200, to: 800 });
    expect(mid.count).toBe(1);
    expect(mid.totalProfit).toBe(100000);
  });
});
