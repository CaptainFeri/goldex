import Decimal from "decimal.js";

export interface DeficitSplit {
  /** The deficit still owed after any cash applied to it. */
  deficit: number;
  /** Collateral quantity consumed to cover it, capped at what the facility holds. */
  consumedCollateral: number;
  /** Value the collateral could not cover — the facility defaults on this. */
  shortfall: number;
}

/**
 * Split a settlement deficit across the collateral that can absorb it and the
 * shortfall that is left over.
 *
 * Used at two points with the same rule: once at valuation, and again when cash
 * covers part of the deficit afterwards (a settlement-workflow funding escrow),
 * where the collateral must only be consumed for the uncovered remainder.
 *
 * @param deficit value owed, in the credit currency
 * @param collateralValue the facility's collateral at mark, in the credit currency
 * @param markPrice price of one collateral unit in the credit currency
 */
export function splitDeficit(
  deficit: number,
  collateralValue: number,
  markPrice: number,
): DeficitSplit {
  const owed = Decimal.max(0, new Decimal(deficit || 0));
  if (!owed.greaterThan(0)) {
    return { deficit: 0, consumedCollateral: 0, shortfall: 0 };
  }
  // A missing mark price would divide the whole calculation by zero; falling
  // back to 1 keeps collateral and value in the same unit so the cap still
  // holds, which is what the callers relied on before this was extracted.
  const price = markPrice || 1;
  const collateralAmount = new Decimal(collateralValue || 0).div(price);
  const consumedCollateral = Decimal.max(
    0,
    Decimal.min(collateralAmount, owed.div(price)),
  );
  const shortfall = Decimal.max(0, owed.minus(consumedCollateral.mul(price)));
  return {
    deficit: owed.toNumber(),
    consumedCollateral: consumedCollateral.toNumber(),
    shortfall: shortfall.toNumber(),
  };
}
