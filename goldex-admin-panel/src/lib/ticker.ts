/**
 * The decisions the market ticker makes, kept out of the component so they can
 * be tested without a DOM.
 */

export type Direction = "up" | "down" | "neutral";

/**
 * Which way a price moved.
 *
 * The API sends no `change` field — it keeps no history to send — so the strip
 * derives direction by remembering the previous poll. Two cases must not read
 * as movement: the first value seen (there is nothing to compare against), and
 * a price that has gone null because its quote dropped out. Treating the
 * latter as a fall to zero would paint the whole ticker red the moment a feed
 * hiccups.
 */
export function directionOf(previous: number | null, next: number | null): Direction {
  if (next === null || previous === null || previous === next) return "neutral";
  return next > previous ? "up" : "down";
}

/**
 * Instruments that carry the gold accent.
 *
 * Driven by the symbol's own `category` rather than a per-item flag, so adding
 * an instrument through the symbol screen styles itself.
 */
const GOLD_CATEGORIES = new Set(["طلا", "سکه", "نقره"]);

export function isGoldCategory(category: string | null | undefined): boolean {
  return GOLD_CATEGORIES.has(category ?? "");
}

/**
 * How long one full scroll takes, from the number of instruments.
 *
 * Fixed seconds-per-item rather than a fixed total, so the marquee keeps a
 * readable pace whether the desk shows four instruments or forty.
 */
export const SECONDS_PER_ITEM = 2.5;

export function marqueeDuration(itemCount: number): string {
  return `${Math.max(itemCount, 1) * SECONDS_PER_ITEM}s`;
}
