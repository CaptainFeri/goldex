/**
 * Warehouse domain constants, aligned with warehouse-roadmap.html:
 * - Common fineness denomination for all wallet/warehouse math is 750 (18 karat).
 * - Tolerance threshold: differences below this are treated as zero.
 */
export const FINENESS_DENOMINATOR = 750;

/** Tolerance threshold (grams): differences below this are considered zero. */
export const TOLERANCE_GRAMS = 0.05;

/**
 * Computes the Net Weight (750) from the physical package data.
 * netWeight(750) = (apparentWeight x fineness) / 750
 */
export function computeNetWeight(apparentWeight: number, fineness: number): number {
  const net = (Number(apparentWeight) * Number(fineness)) / FINENESS_DENOMINATOR;
  return Math.round(net * 1e8) / 1e8;
}