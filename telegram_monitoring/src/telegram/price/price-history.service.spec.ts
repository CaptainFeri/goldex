import { PriceHistoryService } from './price-history.service';
import { parsePriceMessage } from './price-message.parser';

describe('PriceHistoryService', () => {
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
