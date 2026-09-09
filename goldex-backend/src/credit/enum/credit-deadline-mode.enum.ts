/**
 * How a credit-linked request on a price pair gets its settlement deadline.
 *
 * Real desks price the same asset on different settlement conventions, and the
 * deadline convention belongs to the pair, not to the trade:
 *
 * - `NONE`          — the pair has no credit deadline; the request never ages out.
 * - `RELATIVE`      — the clock starts at the trade. "Havaleh, same-day" is
 *                     settled within an hour of registration: warn/expire/grace
 *                     are counted in hours from the moment the request is made.
 * - `DAILY_CUTOFF`  — the deadline is a wall-clock time of day. "Molten gold,
 *                     cash" must be settled by e.g. 14:00; a request made after
 *                     the cutoff rolls to the next business day's cutoff.
 *
 * Both dated modes skip the pair's non-business days (weekly closures and the
 * dated holiday exceptions), so a Thursday-evening request does not fall due on
 * a closed Friday.
 */
export enum CreditDeadlineModeEnum {
  NONE = "NONE",
  RELATIVE = "RELATIVE",
  DAILY_CUTOFF = "DAILY_CUTOFF",
}

/** Deadlines are desk-local times; Iran's market clock is the default. */
export const DEFAULT_DEADLINE_TIMEZONE = "Asia/Tehran";
