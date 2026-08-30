export enum SystemLedgerType {
  // Commission earned by the platform when an order executes.
  COMMISSION_BUY = "COMMISSION_BUY",
  COMMISSION_SELL = "COMMISSION_SELL",
  // Fee charged when a user cashes out a credit purchase.
  CREDIT_CASHOUT_FEE = "CREDIT_CASHOUT_FEE",
  // Commission booked when collateral is converted to cover a cash-out.
  CREDIT_CASHOUT_SPREAD = "CREDIT_CASHOUT_SPREAD",
  // Manual correction by an admin.
  ADJUSTMENT = "ADJUSTMENT",
}
