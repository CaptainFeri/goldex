/**
 * A chart colour for every instrument, always.
 *
 * `symbol.color` is what the desk configured. It is nullable — most symbols
 * predate the column — and a chart with a null stroke draws nothing, so a
 * deterministic fallback stands in. Deterministic matters: an instrument that
 * changed colour between two polls would read as a different series.
 */

/**
 * Distinct hues, ordered so neighbours in the list do not sit next to each
 * other on the wheel. Same palette family as the panels' own `colorFor`.
 */
const PALETTE = [
  "#d4af37",
  "#4c8dff",
  "#2ea861",
  "#e5544b",
  "#b06ef0",
  "#22b8cf",
  "#f08c00",
  "#8a93ab",
] as const;

/** `#rgb`, `#rrggbb` or `#rrggbbaa` — what a CSS stroke accepts. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: string | null | undefined): boolean {
  return typeof value === "string" && HEX.test(value.trim());
}

/** Stable per key: the same slug always lands on the same hue. */
export function fallbackColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * The colour to draw this instrument in.
 *
 * A stored value that is not a valid hex colour is ignored rather than passed
 * through: it would reach the panel as an inline style and silently render as
 * whatever the browser made of it.
 */
export function instrumentColor(stored: string | null | undefined, key: string): string {
  return isHexColor(stored) ? (stored as string).trim() : fallbackColor(key);
}
