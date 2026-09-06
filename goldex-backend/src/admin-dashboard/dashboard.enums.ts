/**
 * The four cards, which act as one global filter.
 *
 * Every dashboard panel is a function of this: the chart, the pie, the feed,
 * the health strip and the table all reshape together. One parameterised set of
 * endpoints rather than four page-specific ones, as §5.3 settled.
 */
export enum DashboardMetric {
  /** Registrations and account state, from `user`. */
  USERS = "users",
  /** Traded volume, from `orders`. */
  VOLUME = "volume",
  /** Platform income, from `system_ledger`. */
  PROFIT = "profit",
  /** Payout requests, from `withdraws`. */
  WITHDRAWALS = "withdrawals",
}

/** How a feed item or a health row should read. */
export enum DashboardSeverity {
  GOOD = "good",
  WARN = "warn",
  BAD = "bad",
  INFO = "info",
}
