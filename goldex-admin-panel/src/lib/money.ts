/**
 * Rial → toman, at the display boundary.
 *
 * The backend stores and serves **rial** everywhere: balances, orders, credits,
 * bank rails, the wire format. Toman is a presentation convention that belongs
 * to this panel — so every conversion in the system happens in this file, on
 * the way to the screen and back from a form.
 *
 * The rule that keeps it honest: **never store a toman value.** Convert on
 * render, convert back on submit, and keep everything in between in rial.
 */

/** 1 toman = 10 rial. */
export const RIAL_PER_TOMAN = 10;

/** What the panel labels amounts with. */
export const DISPLAY_UNIT = "تومان";

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

/** Rial from the API → toman for display. */
export function rialToToman(rial: Amount): number | null {
  const n = toNumber(rial);
  return n === null ? null : n / RIAL_PER_TOMAN;
}

/** Toman a user typed → rial for the API. */
export function tomanToRial(toman: Amount): number | null {
  const n = toNumber(toman);
  return n === null ? null : n * RIAL_PER_TOMAN;
}

/**
 * Format a rial amount as toman for display.
 *
 * Takes rial because that is what the API returns — passing an
 * already-converted value would double-convert, which is the one mistake this
 * module exists to prevent.
 */
export function fmtToman(
  rial: Amount,
  opts: { unit?: boolean; digits?: number; locale?: string } = {}
): string {
  const toman = rialToToman(rial);
  if (toman === null) return "—";
  const text = toman.toLocaleString(opts.locale ?? DISPLAY_LOCALE, {
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

/** True when a symbol slug is the rial-family one, i.e. display it as toman. */
export function isRialSymbol(slug: string | null | undefined): boolean {
  return (slug ?? "").toUpperCase() === "IRR";
}

/**
 * Format by symbol: rial amounts become toman, everything else is shown in its
 * own unit. Use this wherever the symbol is known at render time.
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
 * Use it on input labels. A field showing rial under a "تومان" label — or the
 * reverse — makes the operator out by a factor of ten, and the form gives no
 * hint which one it meant.
 */
export function unitLabel(slug: string | null | undefined): string {
  return isRialSymbol(slug) ? DISPLAY_UNIT : (slug ?? "");
}

/**
 * A value the operator typed → the symbol's own units, for the API.
 *
 * The counterpart to {@link fmtBySymbol}: wherever a form displays converted
 * amounts, its submit must pass through here, or the operator posts a tenth of
 * what they intended.
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
