import { parsePriceMessage } from './price-message.parser';

describe('parsePriceMessage', () => {
  it('parses a خرید (we sell) with حواله and شنا sub-type + description', () => {
    const parsed = parsePriceMessage(
      '74,000,000 🔵خرید⏳با حواله 1 تا شنا\nتوضیحات ❗️ : ۷۳۸۰۰ب ۷۴۰۰۰ تعویضی',
    );
    expect(parsed).toMatchObject({
      price: 74000000,
      sideLabel: 'خرید',
      ourAction: 'WE_SELL',
      subType: 'shena',
      deliveryType: 'با حواله',
      quantity: 1,
      description: '۷۳۸۰۰ب ۷۴۰۰۰ تعویضی',
    });
  });

  it('parses a فروش (we buy) with بی حواله فردا', () => {
    const parsed = parsePriceMessage(
      '73,650,000 🔴فروش⏳بی حواله فردا💵💰 1 تا\nتوضیحات ❗️ : ۲۰۰ گرم',
    );
    expect(parsed).toMatchObject({
      price: 73650000,
      sideLabel: 'فروش',
      ourAction: 'WE_BUY',
      subType: 'normal',
      deliveryType: 'بی حواله فردا',
      quantity: 1,
      description: '۲۰۰ گرم',
    });
  });

  it('parses روز delivery and multi-quantity', () => {
    const parsed = parsePriceMessage('73,550,000 🔵خرید☀️روز 3 تا');
    expect(parsed).toMatchObject({
      price: 73550000,
      deliveryType: 'روز',
      quantity: 3,
      subType: 'normal',
    });
  });

  it('detects معکوس sub-type', () => {
    const parsed = parsePriceMessage('73,100,000 🔵خرید⏳با حواله 1 تا معکوس');
    expect(parsed?.subType).toBe('makus');
    expect(parsed?.deliveryType).toBe('با حواله');
  });

  it('parses نقد حاضر delivery', () => {
    const parsed = parsePriceMessage(
      '73,600,000 🔵خرید☀️نقد حاضر💵💰 1 تا\nتوضیحات ❗️ : ۲۵۰ گرم',
    );
    expect(parsed?.deliveryType).toBe('نقد حاضر');
    expect(parsed?.description).toBe('۲۵۰ گرم');
  });

  it('returns null for non-price text', () => {
    expect(parsePriceMessage('سلام دوستان')).toBeNull();
    expect(parsePriceMessage('')).toBeNull();
    expect(parsePriceMessage(undefined)).toBeNull();
  });
});
