/**
 * The 1-based page an offset falls on.
 *
 * The paginated envelope reports a page number, but these endpoints take
 * limit/offset — this is the one place that conversion lives, so the reported
 * page cannot drift from the rows actually returned.
 */
export function pageOf(offset: number, take: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(take) || take <= 0) return 1;
  return Math.floor(Math.max(0, offset) / take) + 1;
}
