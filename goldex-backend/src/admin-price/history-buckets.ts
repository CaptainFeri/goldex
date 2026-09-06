/**
 * Turning irregular price history into a chartable grid.
 *
 * `price_pair_histories` is written whenever a provider reports, which is
 * neither regular nor aligned between pairs — one instrument may have forty
 * rows in an hour and another two. Charting those side by side by row index
 * would put a gold price from 09:04 next to a dollar price from 06:00 and call
 * them the same point on the x axis.
 *
 * So the window is cut into equal buckets and every series is placed on that
 * one grid. Kept pure and separate from the service so the alignment can be
 * tested without a database.
 */

export interface BucketWindow {
  fromMs: number;
  toMs: number;
  points: number;
  widthMs: number;
}

/**
 * `points` buckets covering the last `hours`, ending now.
 *
 * The width is rounded to whole seconds because it is also handed to Postgres
 * as a divisor and reported to the client as `bucketSeconds`; a fractional
 * width would make those three disagree in the third decimal place. Rounding
 * up rather than down guarantees the buckets still span the whole window, so
 * the final bucket never falls short of `now`.
 */
export function buildWindow(nowMs: number, hours: number, points: number): BucketWindow {
  const spanMs = hours * 3_600_000;
  const widthMs = Math.max(1_000, Math.ceil(spanMs / points / 1_000) * 1_000);
  const toMs = nowMs;
  const fromMs = toMs - widthMs * points;
  return { fromMs, toMs, points, widthMs };
}

/** Start instant of every bucket, oldest first. */
export function bucketStarts(window: BucketWindow): number[] {
  return Array.from({ length: window.points }, (_, i) => window.fromMs + i * window.widthMs);
}

/**
 * Fill empty buckets with the last value before them.
 *
 * A price that has not been reported since 09:00 is still the price at 09:30 —
 * a gap in the feed is not a drop to zero, and drawing it as one is how a chart
 * lies. Buckets *before* the first reading stay null unless a `seed` is given:
 * there the price is genuinely unknown, and carrying a later value backwards
 * would invent history.
 *
 * `seed` is the last price recorded *before* the window opened. Passing it is
 * what stops a chart of a quiet instrument from opening on empty space when
 * the price simply had not moved yet.
 */
export function carryForward(
  values: Array<number | null>,
  seed: number | null = null,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length);
  let last: number | null = seed;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined) last = values[i];
    out[i] = last;
  }
  return out;
}

/** Comma-separated slugs → a de-duplicated list, order preserved, blanks dropped. */
export function parseSlugs(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
