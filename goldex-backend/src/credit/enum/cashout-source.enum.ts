/**
 * Where the money for a credit cash-out comes from (handoff: "cashing out
 * utilized credit"). The user converts a purchase previously made with credit
 * into a real (fully paid) holding; the purchase amount is taken either from
 * their deposit wallet balance or from their frozen collateral.
 */
export enum CashoutSourceEnum {
  /** Debit the credit currency (e.g. IRR) from the user's DEPOSIT wallet. */
  DEPOSIT = "DEPOSIT",
  /** Consume the equivalent value from the frozen collateral (e.g. gold). */
  COLLATERAL = "COLLATERAL",
}
