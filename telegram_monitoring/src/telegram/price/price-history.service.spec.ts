import { PriceHistoryService } from './price-history.service';
import { parsePriceMessage } from './price-message.parser';

import { MITHQALS_PER_KILO } from './price.types';

describe('PriceHistoryService arbitrage', () => {
  let service: PriceHistoryService;

  beforeEach(() => {
    service = new PriceHistoryService();
  });

  const record = (text: string, id: number, date: number) => {
    const parsed = parsePriceMessage(text);
    if (!parsed) throw new Error(`unparseable: ${text}`);
    service.record(parsed, id, date);
    return parsed;
  };

  const profit = (spread: number, qty: number) =>
    Math.round(spread * MITHQALS_PER_KILO * qty);

  it('flags profit when خرید (we sell) exceeds فروش (we buy) in same bucket', () => {
    // فروش 73,500,000 => we BUY at 73.5M
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000);
    // خرید 73,600,000 => we SELL at 73.6M
    const sellSide = record('73,600,000 🔵خرید⏳با حواله 1 تا', 2, 1010);

    const opp = service.detectArbitrage(sellSide, 1010);
    expect(opp).not.toBeNull();
    expect(opp).toMatchObject({
      spread: 100000,
      quantity: 1,
      totalProfit: profit(100000, 1),
      subType: 'normal',
      deliveryType: 'با حواله',
    });
    expect(opp?.buy.price).toBe(73500000);
    expect(opp?.sell.price).toBe(73600000);
  });

  it('ignores opportunities below the minimum profit threshold (default 80,000)', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000); // we buy 73.50M
    const sell = record('73,550,000 🔵خرید⏳با حواله 1 تا', 2, 1010); // spread 50,000
    expect(service.detectArbitrage(sell, 1010)).toBeNull();
  });

  it('requires the spread to be strictly greater than the threshold', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000);
    const sell = record('73,580,000 🔵خرید⏳با حواله 1 تا', 2, 1010); // spread exactly 80,000
    expect(service.detectArbitrage(sell, 1010)).toBeNull();
  });

  it('returns null when there is no positive spread', () => {
    record('73,600,000 🔴فروش⏳با حواله 1 تا', 1, 1000); // we buy 73.6M
    const sell = record('73,500,000 🔵خرید⏳با حواله 1 تا', 2, 1010); // we sell 73.5M
    expect(service.detectArbitrage(sell, 1010)).toBeNull();
  });

  it('does not mix different sub-types or delivery types', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000); // normal / با حواله
    const shenaSell = record('74,000,000 🔵خرید⏳با حواله 1 تا شنا', 2, 1010); // shena
    // No فروش in the shena bucket => no opportunity.
    expect(service.detectArbitrage(shenaSell, 1010)).toBeNull();
  });

  it('ignores shena and makus sub-types entirely', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا شنا', 1, 1000);
    const sell = record('73,600,000 🔵خرید⏳با حواله 1 تا شنا', 2, 1010);
    expect(service.detectArbitrage(sell, 1010)).toBeNull();
  });

  it('ignores prices outside the time window', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000); // stale we-buy
    const sell = record('73,600,000 🔵خرید⏳با حواله 1 تا', 2, 5000); // 4000s later
    expect(service.detectArbitrage(sell, 5000)).toBeNull();
  });

  it('reports an opportunity once, then only again when the spread changes', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000);
    const sell = record('73,600,000 🔵خرید⏳با حواله 1 تا', 2, 1010);
    const opp = service.detectArbitrage(sell, 1010);

    expect(opp).not.toBeNull();
    expect(service.markReportedIfNew(opp!)).toBe(true);
    expect(service.markReportedIfNew(opp!)).toBe(false); // same pair => suppressed

    // A better sell price changes the pair => reportable again.
    const sell2 = record('73,700,000 🔵خرید⏳با حواله 1 تا', 3, 1020);
    const opp2 = service.detectArbitrage(sell2, 1020);
    expect(opp2).not.toBeNull();
    expect(opp2!.sell.price).toBe(73700000);
    expect(service.markReportedIfNew(opp2!)).toBe(true);
  });

  it('attaches the buy/sell order buttons from the source snapshots', () => {
    const buyParsed = parsePriceMessage('73,500,000 🔴فروش⏳با حواله 1 تا');
    expect(buyParsed).not.toBeNull();
    service.record(buyParsed!, 1, 1000, { text: '1', data: 'grp|ord|111|1|1' });
    const sellParsed = parsePriceMessage('73,600,000 🔵خرید⏳با حواله 1 تا');
    expect(sellParsed).not.toBeNull();
    service.record(sellParsed!, 2, 1010, {
      text: '1',
      data: 'grp|ord|222|2|1',
    });

    const opp = service.detectArbitrage(sellParsed!, 1010);
    expect(opp).not.toBeNull();
    expect(opp!.buy.orderButton).toEqual({
      text: '1',
      data: 'grp|ord|111|1|1',
    });
    expect(opp!.sell.orderButton).toEqual({
      text: '1',
      data: 'grp|ord|222|2|1',
    });
  });

  it('computes executable quantity and total profit from the smaller side', () => {
    // we buy 73.5M (qty 3), we sell 73.6M (qty 2) => executable 2
    record('73,500,000 🔴فروش⏳با حواله 3 تا', 1, 1000);
    const sell = record('73,600,000 🔵خرید⏳با حواله 2 تا', 2, 1010);
    const opp = service.detectArbitrage(sell, 1010);
    expect(opp).not.toBeNull();
    expect(opp!.quantity).toBe(2);
    expect(opp!.totalProfit).toBe(profit(100000, 2));
  });

  it('buckets history by sub-type', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000);
    record('74,000,000 🔵خرید⏳با حواله 1 تا شنا', 2, 1001);
    expect(service.getHistory('normal')).toHaveLength(1);
    expect(service.getHistory('shena')).toHaveLength(1);
  });

  it('returns empty array for unknown category', () => {
    expect(service.getHistory('unknown')).toEqual([]);
  });

  it('keeps snapshots in insertion order', () => {
    record('73,500,000 🔴فروش⏳با حواله 1 تا', 1, 1000);
    record('73,600,000 🔵خرید⏳با حواله 1 تا', 2, 1010);
    const history = service.getHistory('normal');
    expect(history).toHaveLength(2);
    expect(history[0].messageId).toBe(1);
    expect(history[1].messageId).toBe(2);
  });

  it('assigns correct category key', () => {
    const parsed = parsePriceMessage('73,500,000 🔴فروش⏳با حواله 1 تا');
    expect(parsed).not.toBeNull();
    expect(service.categoryKeyFor(parsed!)).toBe('normal');

    const sh = parsePriceMessage('74,000,000 🔵خرید⏳با حواله 1 تا شنا');
    expect(sh).not.toBeNull();
    expect(service.categoryKeyFor(sh!)).toBe('shena');
  });
});
