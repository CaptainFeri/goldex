import {
  CurrencyUnit,
  DEFAULT_PROVIDER_PRICE_UNIT,
  fromRial,
  providerUnitLabel,
  resolvePriceUnit,
  toRial,
  unitFromPersianLabel,
} from './currency-unit';

describe('resolvePriceUnit', () => {
  it('reads a declared unit in any casing', () => {
    expect(resolvePriceUnit('IRR')).toBe(CurrencyUnit.RIAL);
    expect(resolvePriceUnit('irr')).toBe(CurrencyUnit.RIAL);
    expect(resolvePriceUnit('toman')).toBe(CurrencyUnit.TOMAN);
  });

  it('falls back to the historical default when unset or junk', () => {
    expect(resolvePriceUnit(undefined)).toBe(DEFAULT_PROVIDER_PRICE_UNIT);
    expect(resolvePriceUnit(null)).toBe(DEFAULT_PROVIDER_PRICE_UNIT);
    expect(resolvePriceUnit('dinar')).toBe(DEFAULT_PROVIDER_PRICE_UNIT);
    expect(resolvePriceUnit(7)).toBe(DEFAULT_PROVIDER_PRICE_UNIT);
  });
});

describe('toRial / fromRial', () => {
  it('scales a Toman quote onto the system currency', () => {
    expect(toRial(466_190, CurrencyUnit.TOMAN)).toBe(4_661_900);
  });

  it('leaves a Rial quote alone', () => {
    expect(toRial(4_661_900, CurrencyUnit.RIAL)).toBe(4_661_900);
  });

  it('prices an outgoing order back in the provider’s own unit', () => {
    // The order path holds Rial; a Toman shop must be sent the Toman figure or
    // the order is placed at ten times the price.
    expect(fromRial(4_661_900, CurrencyUnit.TOMAN)).toBe(466_190);
    expect(fromRial(4_661_900, CurrencyUnit.RIAL)).toBe(4_661_900);
  });

  it('round-trips both ways for either unit', () => {
    for (const unit of [CurrencyUnit.RIAL, CurrencyUnit.TOMAN]) {
      expect(fromRial(toRial(12_345, unit), unit)).toBe(12_345);
      expect(toRial(fromRial(12_345, unit), unit)).toBe(12_345);
    }
  });

  it('passes non-finite amounts through untouched', () => {
    expect(toRial(NaN, CurrencyUnit.TOMAN)).toBeNaN();
    expect(fromRial(Infinity, CurrencyUnit.TOMAN)).toBe(Infinity);
  });
});

describe('providerUnitLabel', () => {
  it('names the unit the way a provider API expects it', () => {
    expect(providerUnitLabel(CurrencyUnit.TOMAN)).toBe('toman');
    expect(providerUnitLabel(CurrencyUnit.RIAL)).toBe('rial');
  });
});

describe('unitFromPersianLabel', () => {
  it('reads the unit a provider states on its own figures', () => {
    expect(unitFromPersianLabel('تومان')).toBe(CurrencyUnit.TOMAN);
    expect(unitFromPersianLabel('ریال')).toBe(CurrencyUnit.RIAL);
    // The Arabic yeh spelling shows up in real payloads.
    expect(unitFromPersianLabel('ريال')).toBe(CurrencyUnit.RIAL);
  });

  it('returns null when the label says neither, so the caller can fall back', () => {
    expect(unitFromPersianLabel('')).toBeNull();
    expect(unitFromPersianLabel('گرم')).toBeNull();
    expect(unitFromPersianLabel(undefined)).toBeNull();
  });
});
