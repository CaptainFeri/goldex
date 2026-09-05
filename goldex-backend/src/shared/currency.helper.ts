import Decimal from "decimal.js";
import { RIAL_PER_TOMAN } from "./constants/currency.constants";

/**
 * Conversion at the bank boundary, and only there.
 *
 * Platform amounts are toman (IRT). Bank rails are rial (IRR). Every adapter
 * that talks to one converts on the way out and on the way in; nothing above
 * the adapter should ever call these.
 *
 * Amounts are `decimal.js` internally because balances are `decimal(20,8)` and
 * `number` loses precision at ounce/BTC magnitudes.
 *
 * @see docs/PARSZARGAR-ADMIN-API-PLAN.md §3.2
 */

export type Amount = string | number | Decimal;

/** Outbound: platform toman → the rial figure the bank expects. */
export function tomanToRial(amount: Amount): string {
  return new Decimal(amount ?? 0).mul(RIAL_PER_TOMAN).toFixed();
}

/**
 * Inbound: a rial figure from a bank statement, transfer result or OCR'd
 * receipt → platform toman.
 *
 * Rial amounts from Iranian banks are whole and divide evenly by 10 in
 * practice, but the division is exact here rather than rounded — a silent
 * rounding step in the money path is how a reconciliation break starts.
 */
export function rialToToman(amount: Amount): string {
  return new Decimal(amount ?? 0).div(RIAL_PER_TOMAN).toFixed();
}

/** True when a rial amount converts to toman without a fractional remainder. */
export function isWholeToman(rialAmount: Amount): boolean {
  return new Decimal(rialAmount ?? 0).mod(RIAL_PER_TOMAN).isZero();
}
