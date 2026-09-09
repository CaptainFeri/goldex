import { moneyFromEnv, RIAL_PER_TOMAN, rialToToman, tomanToRial } from './currency';

describe('tomanToRial / rialToToman', () => {
  it('scales a channel quote onto the service currency', () => {
    expect(tomanToRial(74_000_000)).toBe(740_000_000);
    expect(RIAL_PER_TOMAN).toBe(10);
  });

  it('goes back the other way for a surface that echoes a channel', () => {
    expect(rialToToman(740_000_000)).toBe(74_000_000);
  });

  it('round-trips without drift', () => {
    for (const amount of [1, 73_500_000, 0.5]) {
      expect(rialToToman(tomanToRial(amount))).toBe(amount);
    }
  });

  it('passes a non-finite amount through untouched', () => {
    expect(tomanToRial(NaN)).toBeNaN();
    expect(rialToToman(Infinity)).toBe(Infinity);
  });
});

describe('moneyFromEnv', () => {
  it('prefers the Rial-named variable', () => {
    expect(moneyFromEnv('250000', '10000', 100_000)).toBe(250_000);
  });

  it('converts a leftover Toman-named variable rather than under-reading it', () => {
    // An operator who configured 10,000 Toman keeps that fee, not a tenth of it.
    expect(moneyFromEnv(undefined, '10000', 100_000)).toBe(100_000);
    expect(moneyFromEnv(undefined, '25000', 100_000)).toBe(250_000);
  });

  it('falls back to the default when neither is set or usable', () => {
    expect(moneyFromEnv(undefined, undefined, 100_000)).toBe(100_000);
    expect(moneyFromEnv('', '', 100_000)).toBe(100_000);
    expect(moneyFromEnv('abc', 'abc', 100_000)).toBe(100_000);
    // Zero and negatives are not meaningful amounts here.
    expect(moneyFromEnv('0', '-5', 100_000)).toBe(100_000);
  });
});
