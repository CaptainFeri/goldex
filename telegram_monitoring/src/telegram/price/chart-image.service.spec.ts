import { ChartImageService } from './chart-image.service';
import { ArbitrageOpportunity, PriceSnapshot } from './price.types';

function snap(over: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    price: 0,
    sideLabel: 'فروش',
    ourAction: 'WE_BUY',
    subType: 'shena',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
    messageId: 0,
    date: 0,
    categoryKey: 'shena',
    ...over,
  };
}

describe('ChartImageService.buildPayload', () => {
  const service = new ChartImageService();

  const buy = snap({
    messageId: 1,
    date: 100,
    price: 73900000,
    ourAction: 'WE_BUY',
    sideLabel: 'فروش',
  });
  const sell = snap({
    messageId: 2,
    date: 110,
    price: 74000000,
    ourAction: 'WE_SELL',
    sideLabel: 'خرید',
  });

  it('builds a QuickChart payload with buy/sell series', () => {
    const payload: any = service.buildPayload([buy, sell], 'Test title');

    expect(payload.format).toBe('png');
    expect(payload.chart.type).toBe('line');

    const labels = payload.chart.data.datasets.map((d: any) => d.label);
    expect(labels).toEqual(['We Buy', 'We Sell']);

    const weBuy = payload.chart.data.datasets[0];
    expect(weBuy.data).toEqual([73900000, null]);
    const weSell = payload.chart.data.datasets[1];
    expect(weSell.data).toEqual([null, 74000000]);

    expect(payload.chart.options.plugins.title.text).toBe('Test title');
  });

  it('omits title when not provided', () => {
    const payload: any = service.buildPayload([buy, sell]);
    expect(payload.chart.options.plugins.title).toBeUndefined();
  });

  it('adds buy/sell opportunity marks and a summarizing title when given an arbitrage opportunity', () => {
    const opportunity: ArbitrageOpportunity = {
      categoryKey: 'shena',
      subType: 'shena',
      deliveryType: 'با حواله',
      buy,
      sell,
      spread: 100000,
      quantity: 1,
      totalProfit: 100000,
    };

    const payload: any = service.buildPayload(
      [buy, sell],
      undefined,
      opportunity,
    );

    const labels = payload.chart.data.datasets.map((d: any) => d.label);
    expect(labels).toEqual(['We Buy', 'We Sell', 'Buy ▲', 'Sell ▼']);

    expect(payload.chart.options.plugins.title.text).toContain('73,900,000');
    expect(payload.chart.options.plugins.title.text).toContain('74,000,000');
  });
});
