import { computeCashoutFee } from "./cashout-fee.util";

describe("computeCashoutFee", () => {
  // The rule as stated: 5g of gold at 4% keeps 0.2g and releases 4.8g.
  it("keeps the fee in gold and releases the rest", () => {
    const { feeAsset, netAssetAmount } = computeCashoutFee(5, 10_000_000, 4);
    expect(feeAsset.toNumber()).toBeCloseTo(0.2, 10);
    expect(netAssetAmount.toNumber()).toBeCloseTo(4.8, 10);
  });

  it("values the gold fee in the credit currency without changing it", () => {
    const { feeAsset, feeValue } = computeCashoutFee(5, 10_000_000, 4);
    expect(feeAsset.toNumber()).toBeCloseTo(0.2, 10);
    expect(feeValue.toNumber()).toBeCloseTo(2_000_000, 6);
  });

  it("keeps the asset whole when no fee is configured", () => {
    const { feeAsset, netAssetAmount, feeValue } = computeCashoutFee(5, 10_000_000, 0);
    expect(feeAsset.toNumber()).toBe(0);
    expect(netAssetAmount.toNumber()).toBe(5);
    expect(feeValue.toNumber()).toBe(0);
  });

  it("never splits more than the asset, whatever the rate", () => {
    for (const rate of [0, 0.5, 4, 50, 99.99, 100]) {
      const { feeAsset, netAssetAmount } = computeCashoutFee(5, 10_000_000, rate);
      expect(feeAsset.plus(netAssetAmount).toNumber()).toBeCloseTo(5, 10);
      expect(feeAsset.toNumber()).toBeGreaterThanOrEqual(0);
      expect(netAssetAmount.toNumber()).toBeGreaterThanOrEqual(0);
    }
  });

  it("takes the whole asset at 100% and leaves nothing negative", () => {
    const { feeAsset, netAssetAmount } = computeCashoutFee(5, 10_000_000, 100);
    expect(feeAsset.toNumber()).toBe(5);
    expect(netAssetAmount.toNumber()).toBe(0);
  });

  it("clamps a rate above 100 instead of handing out a negative balance", () => {
    const { feeAsset, netAssetAmount } = computeCashoutFee(5, 10_000_000, 140);
    expect(feeAsset.toNumber()).toBe(5);
    expect(netAssetAmount.toNumber()).toBe(0);
  });

  it("clamps a negative rate instead of inflating the asset", () => {
    const { feeAsset, netAssetAmount } = computeCashoutFee(5, 10_000_000, -4);
    expect(feeAsset.toNumber()).toBe(0);
    expect(netAssetAmount.toNumber()).toBe(5);
  });

  it("holds precision on a fractional gram at a fractional rate", () => {
    // 1.23456789g at 2.5% — the kind of figure a real gold trade produces.
    const { feeAsset, netAssetAmount } = computeCashoutFee(1.23456789, 1, 2.5);
    expect(feeAsset.toNumber()).toBeCloseTo(0.030864197, 9);
    expect(feeAsset.plus(netAssetAmount).toNumber()).toBeCloseTo(1.23456789, 10);
  });

  it("reports nothing for a trade with no asset", () => {
    const { feeAsset, netAssetAmount, feeValue } = computeCashoutFee(0, 10_000_000, 4);
    expect(feeAsset.toNumber()).toBe(0);
    expect(netAssetAmount.toNumber()).toBe(0);
    expect(feeValue.toNumber()).toBe(0);
  });

  it("still charges the gold fee when no price is known to value it", () => {
    const { feeAsset, feeValue } = computeCashoutFee(5, 0, 4);
    expect(feeAsset.toNumber()).toBeCloseTo(0.2, 10);
    expect(feeValue.toNumber()).toBe(0);
  });
});
