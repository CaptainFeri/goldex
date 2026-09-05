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
export function fmtToman(rial: Amount, opts: { unit?: boolean; digits?: number } = {}): string {
  const toman = rialToToman(rial);
  if (toman === null) return "—";
  const text = toman.toLocaleString("en-US", {
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
  const text = n.toLocaleString("en-US", { maximumFractionDigits: digits });
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
export function fmtBySymbol(value: Amount, slug: string | null | undefined, unit?: string): string {
  return isRialSymbol(slug) ? fmtToman(value) : fmtAmount(value, unit ?? slug ?? undefined);
}
