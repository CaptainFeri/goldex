/**
 * Categories for the operator inbox.
 *
 * Deliberately its own list rather than reusing `NotificationCategoryEnum`.
 * That one describes messages sent *to users* (TRADE, PROMOTION, SUPPORT…);
 * this one describes things an operator has to look at. They drift apart
 * naturally, and sharing an enum would force one to grow values the other has
 * no meaning for.
 */
export enum InboxCategory {
  WITHDRAWAL = "withdrawal",
  DEPOSIT = "deposit",
  KYC = "kyc",
  ARBITRAGE = "arbitrage",
  USER = "user",
  SYSTEM = "system",
}

export enum InboxSeverity {
  INFO = "info",
  WARNING = "warning",
  URGENT = "urgent",
}
