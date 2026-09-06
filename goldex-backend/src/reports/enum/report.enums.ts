/**
 * What a report covers.
 *
 * Each type maps to a table this platform actually persists. The panels' form
 * also offers **آربیتراژ**, and it is deliberately absent here: arbitrage
 * signals live only in the pricing engine's Redis snapshots and are never
 * written to Postgres, so a date-ranged export of them would be empty or
 * invented. Add it the day the signals are persisted, not before.
 */
export enum ReportTypeEnum {
  /** Orders — the panels label this «معاملات». */
  TRADES = "trades",
  /** Registered users — «کاربران». */
  USERS = "users",
  /** System ledger rows — «مالی». */
  FINANCIAL = "financial",
  /** Withdrawals — «برداشت‌ها». */
  WITHDRAWALS = "withdrawals",
}

/**
 * Output formats.
 *
 * Both are produced by `exceljs`, already a dependency. **PDF is not offered.**
 * §4.7 of the API plan settled that printable documents stay client-side,
 * where the panels already own pixel-perfect print CSS; adding a headless
 * renderer to this service to duplicate that would be a heavy dependency for a
 * worse result. An enum that accepted PDF and then failed would be a trap, so
 * it is absent rather than rejected at runtime.
 */
export enum ReportFormatEnum {
  XLSX = "xlsx",
  CSV = "csv",
}

export enum ReportStatusEnum {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
}
