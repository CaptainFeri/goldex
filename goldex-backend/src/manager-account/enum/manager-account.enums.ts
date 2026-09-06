/** Whether the manager may still draw on this account. */
export enum ManagerAccountStatusEnum {
  ACTIVE = "ACTIVE",
  /** Frozen by a senior admin — existing allocations stand, new ones are refused. */
  SUSPENDED = "SUSPENDED",
}

/** A funding request moves value into or out of a manager's account. */
export enum ManagerFundingDirectionEnum {
  /** Charge the account (the manager receives capital to trade with). */
  CREDIT = "CREDIT",
  /** Take capital back out of the account. */
  DEBIT = "DEBIT",
}

export enum ManagerFundingStatusEnum {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
}

/**
 * Every movement on a manager account, so a balance can always be explained.
 *
 * ALLOCATION and RELEASE move value between available and allocated without
 * changing the total; the others change the total.
 */
export enum ManagerLedgerTypeEnum {
  /** A senior admin approved a charge. */
  FUNDING_CREDIT = "FUNDING_CREDIT",
  /** A senior admin approved a withdrawal. */
  FUNDING_DEBIT = "FUNDING_DEBIT",
  /** Capital frozen into a bot's risk budget. */
  ALLOCATION = "ALLOCATION",
  /** Frozen capital returned to the available balance. */
  RELEASE = "RELEASE",
  /** A bot's trade closed in profit. */
  PROFIT = "PROFIT",
  /** A bot's trade closed at a loss, consuming the frozen allocation. */
  LOSS = "LOSS",
}
