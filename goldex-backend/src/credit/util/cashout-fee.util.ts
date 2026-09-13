import Decimal from "decimal.js";

export interface CashoutFee {
  /** The fee itself, in the asset being liquidated (e.g. grams of gold). */
  feeAsset: Decimal;
  /** What the user receives: the asset less the fee. */
  netAssetAmount: Decimal;
  /** The fee valued in the credit currency, for revenue that sums across symbols. */
  feeValue: Decimal;
}

/**
 * The cash-out fee, charged in the asset being liquidated rather than in
 * currency: cashing out 5g of gold at 4% keeps 0.2g of that gold, which the
 * platform books as 0.2g, and the user receives the remaining 4.8g.
 *
 * This is the house rule for every commission on the platform — a trade's
 * buy/sell commission and the collateral conversion spread are already taken in
 * the traded or frozen asset — so platform revenue is held as the asset and
 * never depends on a currency conversion at the moment it is booked.
 *
 * @param assetAmount the asset the cash-out releases, before the fee
 * @param price one unit of that asset in the credit currency, for `feeValue`
 * @param feePercent the facility's fee rate
 */
export function computeCashoutFee(
  assetAmount: number,
  price: number,
  feePercent: number,
): CashoutFee {
  const gross = Decimal.max(0, new Decimal(assetAmount || 0));
  // A rate outside 0..100 would hand the user more than the purchase or leave
  // them nothing; clamping keeps the split well-formed whatever is configured.
  const rate = Decimal.min(100, Decimal.max(0, new Decimal(feePercent || 0))).div(100);
  const feeAsset = gross.mul(rate);
  return {
    feeAsset,
    netAssetAmount: Decimal.max(0, gross.minus(feeAsset)),
    feeValue: feeAsset.mul(Decimal.max(0, new Decimal(price || 0))),
  };
}
