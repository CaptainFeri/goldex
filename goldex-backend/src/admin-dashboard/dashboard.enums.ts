/**
 * The cards, which act as one global filter.
 *
 * Every dashboard panel is a function of this: the chart, the pie, the feed,
 * the health strip and the table all reshape together. One parameterised set of
 * endpoints rather than one per page, as §5.3 settled.
 *
 * Several metrics narrow further — a symbol category, an order type, a
 * warehouse — which is what `DashboardFilter` carries.
 */
export enum DashboardMetric {
  /** Account state, from `user` and its KYC. */
  USERS = "users",
  /** Traded volume, from `orders`, by symbol category. */
  VOLUME = "volume",
  /** Platform income, from `system_ledger`. */
  PROFIT = "profit",
  /** Rial payout requests, from `withdraws`, by channel. */
  WITHDRAWALS = "withdrawals",
  /** Price providers and their share of executed flow. */
  PROVIDERS = "providers",
  /** Order counts by execution type: quote, limit, market. */
  TRADES = "trades",
  /** Credit lines and the collateral behind them. */
  CREDITS = "credits",
  /** Warehouse packets: held, being prepared, orphaned. */
  INVENTORY = "inventory",
}

/** How a feed item or a health row should read. */
export enum DashboardSeverity {
  GOOD = "good",
  WARN = "warn",
  BAD = "bad",
  INFO = "info",
}

/**
 * The categories the volume card splits by.
 *
 * These are the platform's symbol types: what is traded decides which column
 * the volume belongs in, and mixing gold grams with Rial in one total is the
 * thing this filter exists to prevent.
 */
export enum DashboardVolumeCategory {
  MATERIAL = "material",
  CRYPTO = "crypto",
  FIAT = "fiat",
  RIAL = "rial",
}

/**
 * The channels a Rial withdrawal can leave by.
 *
 * `EM` is the peer-to-peer settlement screen's flow, which is stored as a
 * `p2p` withdrawal — the name operators use for it is EM, so that is what the
 * filter is called.
 */
export enum DashboardWithdrawChannel {
  AUTO = "auto",
  MANUAL = "manual",
  EM = "em",
}
