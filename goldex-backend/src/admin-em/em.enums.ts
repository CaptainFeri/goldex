/**
 * The EM screen's four request types.
 *
 * A projection of what already exists in `src/p2p`, not a new lifecycle —
 * see docs/ADMIN-EM.md for the mapping.
 */
export enum EmRequestType {
  /** A `p2p_withdraw_request`. */
  WITHDRAW = "withdraw",
  /** A `p2p_deposit_intent`. */
  DEPOSIT = "deposit",
  /** A withdraw request being settled by the company (matches with source = ADMIN). */
  SETTLEMENT = "settlement",
  /**
   * An `admin_bank_account` transfer leg.
   *
   * Declared because the screen shows it, but nothing in `src/p2p` records one:
   * those transfers live on the Shahin rail. No row is ever projected with this
   * type today; see docs/ADMIN-EM.md.
   */
  TRANSFER = "transfer",
}

/** The four statuses the EM table filters on, derived from the P2P state machines. */
export enum EmStatus {
  AWAITING_ACCOUNT = "awaiting_account",
  AWAITING_RECEIPT = "awaiting_receipt",
  RECEIPT_PAID = "receipt_paid",
  REJECTED = "rejected",
  /** Anything the four above do not describe — completed, expired, cancelled. */
  CLOSED = "closed",
}

export enum EmSearchBy {
  REQUESTER = "requester",
  PERFORMER = "performer",
  ACCOUNT = "account",
}
