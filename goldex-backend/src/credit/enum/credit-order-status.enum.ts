export enum CreditOrderStatusEnum {
  ACTIVE = "ACTIVE",
  MARGIN_CALLED = "MARGIN_CALLED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  CLOSED = "CLOSED",
  /** The trade was cashed out — paid off and moved to the deposit wallet, facility left open. */
  CASHED_OUT = "CASHED_OUT",
}
