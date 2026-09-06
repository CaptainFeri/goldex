/**
 * The decisions the price screen makes, kept out of the component so they can
 * be tested without a DOM.
 */
import type { PriceHistory, PriceHistoryRow, PriceInstrument, PriceInstruments } from "../api/types";

/** Buy is green, sell is red, matching the reference screen and the badges. */
export const BUY_COLOR = "#3fb985";
export const SELL_COLOR = "#e0625a";

export type ChartMode = "all" | "buy" | "sell";

export const CHART_MODES: Array<{ id: ChartMode; label: string }> = [
  { id: "all", label: "همه" },
  { id: "buy", label: "خرید" },
  { id: "sell", label: "فروش" },
];

/** How many instruments a legend stays readable at. */
export const LEGEND_LIMIT = 8;

/** Every instrument, flattened out of its category groups. */
export function flatten(data: PriceInstruments | undefined): PriceInstrument[] {
  return data?.groups.flatMap((g) => g.items) ?? [];
}

/** Add or remove one id, preserving the order the operator picked them in. */
export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/**
 * Narrow the catalogue by a free-text query.
 *
 * Name, slug and category, so typing «ارز» finds a whole group and typing a
 * slug finds one instrument. Empty groups drop out rather than rendering as
 * bare headings.
 */
export function filterGroups(
  data: PriceInstruments | undefined,
  query: string,
): Array<{ category: string; items: PriceInstrument[] }> {
  const q = query.trim().toLowerCase();
  const groups = data?.groups ?? [];
  if (!q) return groups;
  return groups
    .map((g) => ({
      category: g.category,
      items: g.items.filter((i) =>
        [i.name, i.slug, g.category].some((v) => (v ?? "").toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Chart.js datasets for the selected instruments.
 *
 * Driven by `series[]` from the API rather than by the selection: the server
 * decides which slugs it could chart, and it publishes the row keys, so a
 * client that built `${slug}_buy` itself would silently draw nothing the day
 * that naming changed.
 *
 * Nulls are kept as nulls — `spanGaps: false` then draws a gap where there is
 * genuinely no recorded price, instead of a line through zero.
 */
export function buildDatasets(history: PriceHistory | undefined, mode: ChartMode) {
  if (!history) return [];
  const datasets: Array<Record<string, unknown>> = [];

  for (const s of history.series) {
    if (mode === "all" || mode === "buy") {
      datasets.push({
        label: `${s.name} — خرید`,
        data: history.rows.map((r) => valueAt(r, s.buyKey)),
        borderColor: BUY_COLOR,
        backgroundColor: BUY_COLOR,
        borderWidth: 2,
        pointRadius: 0,
        spanGaps: false,
        tension: 0.3,
      });
    }
    if (mode === "all" || mode === "sell") {
      datasets.push({
        label: `${s.name} — فروش`,
        data: history.rows.map((r) => valueAt(r, s.sellKey)),
        // Dashed, so buy and sell stay distinguishable when a screen is
        // printed or an operator cannot separate the two hues.
        borderColor: SELL_COLOR,
        backgroundColor: SELL_COLOR,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        spanGaps: false,
        tension: 0.3,
      });
    }
  }
  return datasets;
}

function valueAt(row: PriceHistoryRow, key: string): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

/**
 * Instruments whose prices differ by more than this factor cannot share a
 * linear axis: gold at 89,000,000 rial and a dollar at 58,000 rial put one line
 * on the ceiling and the other flat on the floor, and neither can be read.
 */
export const LOG_SCALE_RATIO = 50;

/**
 * Should the y axis be logarithmic?
 *
 * A log axis keeps every value true — unlike normalising to a percentage or an
 * index, which would make the tooltip disagree with the price card next to it.
 * It is only reached for when the spread of magnitudes leaves no alternative,
 * and the screen says so when it is in effect.
 */
export function needsLogScale(history: PriceHistory | undefined): boolean {
  let min = Infinity;
  let max = 0;
  for (const row of history?.rows ?? []) {
    for (const key of Object.keys(row)) {
      if (key === "i" || key === "at") continue;
      const v = row[key];
      // Zero and negatives have no place on a log axis; a price is neither.
      if (typeof v !== "number" || v <= 0) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min !== Infinity && max / min > LOG_SCALE_RATIO;
}

/** X labels: the bucket instants, as clock times. */
export function chartLabels(history: PriceHistory | undefined): string[] {
  return (history?.rows ?? []).map((r) =>
    typeof r.at === "string"
      ? new Date(r.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
      : "",
  );
}

/**
 * What the market toggle should read.
 *
 * Three states, not two: an instrument whose pair has never been reconciled is
 * unknown, and showing it as closed would be a claim the server did not make.
 */
export function marketLabel(instrument: PriceInstrument): string {
  if (instrument.marketOpen === null) return "وضعیت بازار (نامشخص)";
  return instrument.marketOpen ? "وضعیت بازار (باز)" : "وضعیت بازار (بسته)";
}

/** The confirmation an operator reads before a market moves. */
export function confirmMarketMessage(instrument: PriceInstrument, next: boolean): string {
  return next
    ? `از باز کردن بازار ${instrument.name} مطمئن هستید؟`
    : `از بستن بازار ${instrument.name} مطمئن هستید؟ سفارش‌های باز این بازار بسته می‌شوند.`;
}

/** Why the server says a market is in the state it is. */
const REASONS: Record<string, string> = {
  "price-fresh": "قیمت زنده",
  "stale-price": "قیمت قدیمی",
  "no-price": "بدون قیمت",
  "bridge-price": "قیمت غیرمستقیم",
  "pool-default-open": "باز به‌صورت پیش‌فرض",
  "admin-override": "اعمال دستی مدیر",
};

export function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  // An unknown reason is shown as it came rather than hidden: the server may
  // add one before this map does, and a blank cell explains nothing.
  return REASONS[reason] ?? reason;
}

/** Why a requested slug produced no line. */
const MISSING_REASONS: Record<string, string> = {
  "unknown-symbol": "نماد ناشناخته",
  "no-pair": "جفت‌ارز ریالی ندارد",
};

export function missingLabel(reason: string): string {
  return MISSING_REASONS[reason] ?? reason;
}

/**
 * The poll interval, in milliseconds, from the server's own advice.
 *
 * Falls back to three seconds — what the reference screen showed and what the
 * ticker polls at — when the config has not loaded yet. Clamped, because a
 * config row edited to zero would busy-loop the browser.
 */
export function pollMs(refreshIntervalSec: number | undefined): number {
  const sec = Number(refreshIntervalSec);
  if (!Number.isFinite(sec) || sec <= 0) return 3000;
  return Math.min(Math.max(sec, 1), 300) * 1000;
}
