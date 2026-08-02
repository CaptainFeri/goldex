import { formatPriceMovementAlert, formatBestPriceAlert } from './price-message.formatter';
import { MarketOpportunity } from './price.types';

describe('formatPriceMovementAlert', () => {
  const opp: MarketOpportunity = {
    type: 'PRICE_MOVEMENT',
    deliveryType: 'آبشده',
    direction: 'UP',
    ourAction: 'WE_SELL',
    price: 75500000,
    previousPrice: 74000000,
    changePercent: 2.03,
    messageId: 100,
    date: 1000,
    quantity: 2,
    description: '۲۰۰ گرم',
  };

  it('includes delivery type, price change, and percentage', () => {
    const msg = formatPriceMovementAlert(opp);
    expect(msg).toContain('آبشده');
    expect(msg).toContain('74,000,000');
    expect(msg).toContain('75,500,000');
    expect(msg).toContain('+2.03%');
    expect(msg).toContain('۲');
  });

  it('omits description when not present', () => {
    const noDesc = { ...opp, description: undefined };
    const msg = formatPriceMovementAlert(noDesc);
    expect(msg).not.toContain('گرم');
  });

  it('shows DOWN direction with minus sign', () => {
    const down: MarketOpportunity = { ...opp, direction: 'DOWN', changePercent: -1.5, price: 73000000, previousPrice: 74110000 };
    const msg = formatPriceMovementAlert(down);
    expect(msg).toContain('کاهش');
    expect(msg).toContain('-1.5%');
  });

  it('shows the side and profit info for WE_SELL', () => {
    const msg = formatPriceMovementAlert(opp);
    expect(msg).toContain('سمت: خرید');
    expect(msg).toContain('ما میفروشیم');
    expect(msg).toContain('سمت سود ما');
  });

  it('shows the side and cost info for WE_BUY', () => {
    const msg = formatPriceMovementAlert({ ...opp, ourAction: 'WE_BUY' });
    expect(msg).toContain('سمت: فروش');
    expect(msg).toContain('ما میخریم');
    expect(msg).toContain('سمت هزینه ما');
  });
});

describe('formatBestPriceAlert', () => {
  const opp: MarketOpportunity = {
    type: 'BEST_PRICE',
    deliveryType: 'با حواله',
    direction: 'UP',
    ourAction: 'WE_SELL',
    price: 76200000,
    previousPrice: 75800000,
    changePercent: 0.53,
    messageId: 200,
    date: 2000,
    quantity: 3,
  };

  it('includes delivery type, price, change, and side', () => {
    const msg = formatBestPriceAlert(opp);
    expect(msg).toContain('با حواله');
    expect(msg).toContain('76,200,000');
    expect(msg).toContain('+0.53%');
    expect(msg).toContain('3');
    expect(msg).toContain('بالاترین قیمت فروش');
    expect(msg).toContain('سمت سود ما');
    expect(msg).toContain('سود ما');
  });

  it('shows lowest buy price label and savings for WE_BUY', () => {
    const buy: MarketOpportunity = { ...opp, direction: 'DOWN', ourAction: 'WE_BUY', price: 75500000, previousPrice: 75800000, changePercent: -0.4 };
    const msg = formatBestPriceAlert(buy);
    expect(msg).toContain('پایینترین قیمت خرید');
    expect(msg).toContain('سمت هزینه ما');
    expect(msg).toContain('صرفهجویی ما');
  });
});
