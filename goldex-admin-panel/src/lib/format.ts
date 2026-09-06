import { DISPLAY_LOCALE } from "./money";

/**
 * A number for display.
 *
 * Persian digits and the `٬` group separator, matching ui-parszargar — which
 * renders every number through `toFa`, counts included — and matching the
 * dates this module already formats as `fa-IR` and the amounts `lib/money`
 * formats. `toLocaleString("fa-IR")` produces exactly the same string as
 * ui-parszargar's own `fmt`.
 *
 * Display only. Never feed the result back into an `<input>` or `Number()`:
 * Persian digits do not survive that round trip. Use `toFormAmount` from
 * `lib/money` to seed a field.
 */
export function fmtNum(
  v: number | string | null | undefined,
  digits = 0,
): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: digits });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Seconds → compact duration, e.g. "12s", "3m 5s", "1h 4m".
export function fmtDuration(sec: number | null | undefined): string {
  const s = Math.round(Number(sec) || 0);
  if (s <= 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtTime(v: string): string {
  const d = new Date(v);
  return d.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// A symbol may be a nested object {slug,name} or a plain string.
export function symbolLabel(s: any): string {
  if (s && typeof s === "object") return s.slug ?? s.name ?? s.code ?? "—";
  return String(s ?? "—");
}

// Pair base/quote come back as nested symbol objects (or, on some endpoints,
// flat *Code strings). Normalise to a "XAU/USD" label.
export function pairLabel(p: any): string {
  if (!p) return "—";
  const base = p.baseSymbol?.slug ?? p.baseSymbol?.name ?? p.baseCode ?? "?";
  const quote =
    p.quoteSymbol?.slug ?? p.quoteSymbol?.name ?? p.quoteCode ?? "?";
  return `${base}/${quote}`;
}

// Deterministic colour per provider key so a provider keeps the same hue.
const PALETTE = [
  "#d4af37",
  "#4c8dff",
  "#2ea861",
  "#e5544b",
  "#b06ef0",
  "#22b8cf",
  "#f08c00",
];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Base and quote slugs off a price pair.
 *
 * Orders carry amounts in two different units — quantity in the base symbol,
 * price and value in the quote — so a screen showing both needs each one
 * separately to format correctly.
 */
export function baseSlug(pair: any): string | null {
  return (
    pair?.baseSymbol?.slug ?? pair?.baseSymbol?.name ?? pair?.baseCode ?? null
  );
}

export function quoteSlug(pair: any): string | null {
  return (
    pair?.quoteSymbol?.slug ??
    pair?.quoteSymbol?.name ??
    pair?.quoteCode ??
    null
  );
}

/**
 * A Jalali year, ungrouped.
 *
 * `fmtNum` renders 1405 as ۱٬۴۰۵ — correct for a quantity, wrong for a year.
 * Shared because two screens got it wrong independently.
 */
export function fmtYear(year: number | string | null | undefined): string {
  const n = typeof year === "string" ? Number(year) : year;
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString(DISPLAY_LOCALE, { useGrouping: false });
}

// ─── Rial (IRR) ──────────────────────────────────────────────
// The Iranian market feeds behind the panel — the gold Telegram channels and
// the pricing engine's providers — quote in toman. The panel speaks rial
// everywhere, so those figures are converted on the way in and on the way back
// out to the engine.
export const IRR_PER_TOMAN = 10;

export function tomanToIrr(
  v: number | string | null | undefined,
): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n * IRR_PER_TOMAN;
}

export function irrToToman(
  v: number | string | null | undefined,
): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return null;
  return n / IRR_PER_TOMAN;
}

/** A toman figure from an upstream feed, rendered as a rial amount. */
export function fmtIrrFromToman(
  v: number | string | null | undefined,
  digits = 0,
): string {
  return fmtNum(tomanToIrr(v), digits);
}
