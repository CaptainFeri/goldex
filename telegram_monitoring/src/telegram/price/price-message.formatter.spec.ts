import { formatArbitrageMessage } from './price-message.formatter';
import { ArbitrageOpportunity, PriceSnapshot } from './price.types';

function snapshot(overrides: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    price: 0,
    sideLabel: 'فروش',
    ourAction: 'WE_BUY',
    subType: 'normal',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
    messageId: 0,
    date: 0,
    categoryKey: 'normal',
    chatId: '-1003944865897',
    ...overrides,
  };
}

describe('formatArbitrageMessage', () => {
  const opportunity: ArbitrageOpportunity = {
    categoryKey: 'normal',
    subType: 'normal',
    deliveryType: 'با حواله',
    buy: snapshot({
      price: 73500000,
      quantity: 3,
      messageId: 565930,
      orderButton: { text: '1', data: 'grp|ord|574929|602|1' },
      description: '۲۰۰ گرم',
    }),
    sell: snapshot({
      sideLabel: 'خرید',
      ourAction: 'WE_SELL',
      price: 73600000,
      quantity: 2,
      messageId: 565962,
      orderButton: { text: '1', data: 'grp|ord|574931|487|1' },
    }),
    spread: 100000,
    quantity: 2,
    totalProfit: 200000,
  };

  it('includes both order details, profit, and source-message links', () => {
    const msg = formatArbitrageMessage(opportunity);

    expect(msg).toContain('💰 قیمت: 73,500,000');
    expect(msg).toContain('💰 قیمت: 73,600,000');
    expect(msg).toContain('🧾 سفارش: 574929'); // order id parsed from callback
    expect(msg).toContain('🧾 سفارش: 574931');
    expect(msg).toContain('📝 ۲۰۰ گرم'); // description preserved
    expect(msg).toContain('سود کل: 200,000');
    // Tap-to-open links to the source messages (private channel /c/ form).
    expect(msg).toContain('https://t.me/c/3944865897/565930');
    expect(msg).toContain('https://t.me/c/3944865897/565962');
  });

  it('omits links when the chat id is unavailable', () => {
    const noChat: ArbitrageOpportunity = {
      ...opportunity,
      buy: snapshot({ ...opportunity.buy, chatId: undefined }),
      sell: snapshot({ ...opportunity.sell, chatId: undefined }),
    };
    expect(formatArbitrageMessage(noChat)).not.toContain('https://t.me/');
  });
});
