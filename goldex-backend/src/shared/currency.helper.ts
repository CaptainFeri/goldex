import Decimal from "decimal.js";
import { RIAL_PER_TOMAN } from "./constants/currency.constants";

/**
 * Rial ↔ toman conversion, for presentation only.
 *
 * The platform stores and moves rial (IRR) end to end — balances, orders,
 * credits, vouchers and the bank rails are all the same unit, so nothing in the
 * money path converts. Toman is a display convention: these exist for a surface
 * that has to render or accept a toman figure, and must never be reached for
 * inside a balance, an order or a settlement.
 *
 * Amounts are `decimal.js` internally because balances are `decimal(20,8)` and
 * `number` loses precision at ounce/BTC magnitudes.
 *
 * @see src/shared/constants/currency.constants.ts
 */

export type Amount = string | number | Decimal;

/** A toman figure entered by a user → the rial the platform stores. */
export function tomanToRial(amount: Amount): string {
  return new Decimal(amount ?? 0).mul(RIAL_PER_TOMAN).toFixed();
}

/**
 * A stored rial amount → the toman figure a surface displays.
 *
 * Rial amounts are whole and divide evenly by 10 in practice, but the division
 * is exact here rather than rounded — a silent rounding step anywhere near
 * money is how a reconciliation break starts.
 */
export function rialToToman(amount: Amount): string {
  return new Decimal(amount ?? 0).div(RIAL_PER_TOMAN).toFixed();
}

/** True when a rial amount converts to toman without a fractional remainder. */
export function isWholeToman(rialAmount: Amount): boolean {
  return new Decimal(rialAmount ?? 0).mod(RIAL_PER_TOMAN).isZero();
}
