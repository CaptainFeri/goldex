import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PricePersistenceService } from './price-persistence.service';
import { PriceSnapshot, sideToAction } from './price.types';

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
  // Keep ourAction consistent with the (possibly overridden) side.
  return { ...base, ourAction: sideToAction(base.sideLabel) };
}

describe('PricePersistenceService', () => {
  let file: string;
  let service: PricePersistenceService;

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prices-')), 'p.jsonl');
    process.env.PRICE_DATA_FILE = file;
    service = new PricePersistenceService();
    service.onModuleInit();
  });

  afterEach(() => {
    delete process.env.PRICE_DATA_FILE;
  });

  it('filters by sub-type, action (our perspective) and date range', () => {
    // خرید message => WE_SELL ; فروش message => WE_BUY
    service.handlePrice({ snapshot: snapshot({ messageId: 1, date: 100, subType: 'shena', sideLabel: 'خرید' }) });
    service.handlePrice({ snapshot: snapshot({ messageId: 2, date: 200, subType: 'normal', sideLabel: 'فروش' }) });
    service.handlePrice({ snapshot: snapshot({ messageId: 3, date: 300, subType: 'shena', sideLabel: 'فروش' }) });

    expect(service.query({ subType: 'shena' }).map((p) => p.messageId)).toEqual([1, 3]);
    // WE_BUY corresponds to the فروش messages (2 and 3).
    expect(service.query({ action: 'WE_BUY' }).map((p) => p.messageId)).toEqual([2, 3]);
    expect(service.query({ action: 'WE_SELL' }).map((p) => p.messageId)).toEqual([1]);
    expect(service.query({ from: 150, to: 250 }).map((p) => p.messageId)).toEqual([2]);
    expect(service.query({ limit: 1 }).map((p) => p.messageId)).toEqual([3]);
  });

  it('persists across instances and exposes distinct filters', async () => {
    service.handlePrice({ snapshot: snapshot({ subType: 'makus', deliveryType: 'روز' }) });
    // allow the serialized append to flush
    await new Promise((r) => setTimeout(r, 20));

    const reloaded = new PricePersistenceService();
    reloaded.onModuleInit();

    expect(reloaded.query()).toHaveLength(1);
    const filters = reloaded.filters();
    expect(filters.deliveryTypes).toContain('روز');
    expect(filters.subTypes).toContainEqual({ value: 'makus', label: 'معکوس' });
  });
});
