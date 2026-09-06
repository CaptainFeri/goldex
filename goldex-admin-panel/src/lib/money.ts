/**
 * Rial at the display boundary.
 *
 * The backend stores and serves **rial** everywhere: balances, orders, credits,
 * bank rails, the wire format. The panel used to render that as toman; it now
 * shows rial end to end, so this file converts nothing — it is the single place
 * that decides the unit, and the pass-through helpers below keep every screen
 * and form going through it.
 *
 * The names still say toman because ~290 call sites across 31 screens use them.
 * They are pass-throughs: **nothing here divides or multiplies by ten.** Read
 * `rialToToman` as "an API amount, ready to display" and `tomanToRial` as "a
 * typed amount, ready to post". Everything is rial, in and out.
 */

/**
 * Kept for reference: 1 toman = 10 rial. Nothing in this module applies it any
 * more — it is here so the old ratio is documented rather than rediscovered.
 */
export const RIAL_PER_TOMAN = 10;

/** What the panel labels amounts with. */
export const DISPLAY_UNIT = "ریال";

/**
 * Persian digits, matching the rest of this RTL panel and the ui-parszargar
 * design. Override per call only where Latin digits are genuinely wanted.
 */
export const DISPLAY_LOCALE = "fa-IR";

type Amount = number | string | null | undefined;

const toNumber = (v: Amount): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

/** An amount from the API, ready to display. Rial in, rial out. */
export function rialToToman(rial: Amount): number | null {
  return toNumber(rial);
}

/** An amount a user typed, ready to post. Rial in, rial out. */
export function tomanToRial(toman: Amount): number | null {
  return toNumber(toman);
}

/** Format a rial amount for display, in rial. */
export function fmtToman(
  rial: Amount,
  opts: { unit?: boolean; digits?: number; locale?: string } = {}
): string {
  const n = toNumber(rial);
  if (n === null) return "—";
  const text = n.toLocaleString(opts.locale ?? DISPLAY_LOCALE, {
    maximumFractionDigits: opts.digits ?? 0,
  });
  return opts.unit === false ? text : `${text} ${DISPLAY_UNIT}`;
}

/**
 * Format an amount that is already in its own symbol's units — gold grams,
 * USDT, and so on. No conversion; only rial-family amounts are converted.
 */
export function fmtAmount(value: Amount, unit?: string, digits = 8): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const text = n.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

/** True when a symbol slug is the rial-family one. */
export function isRialSymbol(slug: string | null | undefined): boolean {
  return (slug ?? "").toUpperCase() === "IRR";
}

/**
 * Format by symbol: rial amounts get the rial label, everything else is shown
 * in its own unit. Use this wherever the symbol is known at render time.
 */
export function fmtBySymbol(
  value: Amount,
  slug: string | null | undefined,
  opts: { unit?: string; digits?: number } = {}
): string {
  return isRialSymbol(slug)
    ? fmtToman(value, { digits: opts.digits })
    : fmtAmount(value, opts.unit ?? slug ?? undefined, opts.digits ?? 8);
}

/**
 * The unit an operator reads and types for a symbol.
 *
 * Use it on input labels: a rial field under any other label leaves the
 * operator guessing which unit the form meant.
 */
export function unitLabel(slug: string | null | undefined): string {
  return isRialSymbol(slug) ? DISPLAY_UNIT : (slug ?? "");
}

/**
 * A value the operator typed → the symbol's own units, for the API.
 *
 * The counterpart to {@link fmtBySymbol}. It no longer rescales rial, but every
 * form still submits through it, so the unit stays decided in one place.
 */
export function toApiAmount(value: Amount, slug: string | null | undefined): number | null {
  return isRialSymbol(slug) ? tomanToRial(value) : toNumber(value);
}

/**
 * An amount from the API → the number to seed a form input with.
 *
 * Returns a plain number, not a formatted string: grouping separators and
 * Persian digits do not survive a round trip through `<input type="number">`.
 */
export function toFormAmount(value: Amount, slug: string | null | undefined): number | null {
  return isRialSymbol(slug) ? rialToToman(value) : toNumber(value);
}
