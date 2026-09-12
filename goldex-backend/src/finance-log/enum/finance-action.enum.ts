/**
 * What a finance-log row records.
 *
 * The log began as a credit-only audit trail whose actions lived in their own
 * `CreditActionEnum`; this replaces it rather than sitting beside it, because two
 * enums feeding one column would only drift. The first block is therefore that
 * enum value for value — those strings are already in the database and in
 * `finance_log.action_type`'s Postgres enum, and existing rows must keep reading
 * correctly. The blocks after it cover the rest of the platform's money
 * movements, which were previously unlogged.
 *
 * Every balance change writes a wallet transaction, and a subscriber turns each
 * of those into a row here, so the set below has to cover every
 * `TransactionTypeEnum` — `mapTransactionType` is exhaustive over it, with
 * `OTHER` only as the guard for a type added later.
 */
export enum FinanceActionEnum {
  // ── Credit facility (pre-existing values — do not rename) ──────────
  CREDIT_CREATED = "CREDIT_CREATED",
  CREDIT_ACTIVATED = "CREDIT_ACTIVATED",
  CREDIT_SETTLED = "CREDIT_SETTLED",
  CREDIT_EXPIRED = "CREDIT_EXPIRED",
  CREDIT_CANCELLED = "CREDIT_CANCELLED",
  WALLET_FROZEN = "WALLET_FROZEN",
  WALLET_UNFROZEN = "WALLET_UNFROZEN",
  BALANCE_INCREASED = "BALANCE_INCREASED",
  BALANCE_FROZEN_FOR_CREDIT = "BALANCE_FROZEN_FOR_CREDIT",
  BALANCE_UNFROZEN_FOR_CREDIT = "BALANCE_UNFROZEN_FOR_CREDIT",
  MATERIAL_FREEZE = "MATERIAL_FREEZE",
  LIQUIDATION = "LIQUIDATION",
  ORDER_CANCELLED_MARGIN = "ORDER_CANCELLED_MARGIN",
  EXPIRY_FREEZE_ALL = "EXPIRY_FREEZE_ALL",
  USER_STATUS_CHANGED = "USER_STATUS_CHANGED",
  ALL_WALLETS_FROZEN = "ALL_WALLETS_FROZEN",
  REMINDER_SENT = "REMINDER_SENT",
  CREDIT_SUSPENDED = "CREDIT_SUSPENDED",
  CREDIT_REACTIVATED = "CREDIT_REACTIVATED",
  CREDIT_EXTENDED = "CREDIT_EXTENDED",
  CREDIT_LIMIT_ADJUSTED = "CREDIT_LIMIT_ADJUSTED",
  CREDIT_FORCE_LIQUIDATED = "CREDIT_FORCE_LIQUIDATED",
  CREDIT_CASHED_OUT = "CREDIT_CASHED_OUT",

  // ── Money in and out ──────────────────────────────────────────────
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  MATERIAL_DEPOSIT = "MATERIAL_DEPOSIT",
  MATERIAL_WITHDRAW = "MATERIAL_WITHDRAW",

  // ── Trading ───────────────────────────────────────────────────────
  ORDER_PLACED = "ORDER_PLACED",
  ORDER_BUY = "ORDER_BUY",
  ORDER_SELL = "ORDER_SELL",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  ORDER_REJECTED = "ORDER_REJECTED",

  // ── Platform revenue and corrections ──────────────────────────────
  COMMISSION = "COMMISSION",
  REFERRAL = "REFERRAL",
  ADMIN_ADJUSTMENT = "ADMIN_ADJUSTMENT",

  // ── Credit wallet movements ───────────────────────────────────────
  CREDIT_DEPOSIT = "CREDIT_DEPOSIT",
  CREDIT_WITHDRAWAL = "CREDIT_WITHDRAWAL",
  MATERIAL_UNFREEZE = "MATERIAL_UNFREEZE",

  // ── Rial P2P ──────────────────────────────────────────────────────
  P2P_WITHDRAW_LOCK = "P2P_WITHDRAW_LOCK",
  P2P_WITHDRAW_SETTLE = "P2P_WITHDRAW_SETTLE",
  P2P_WITHDRAW_RELEASE = "P2P_WITHDRAW_RELEASE",
  P2P_DEPOSIT_SETTLE = "P2P_DEPOSIT_SETTLE",
  P2P_ADMIN_SETTLE = "P2P_ADMIN_SETTLE",

  /** A wallet transaction of a type this enum does not name yet. */
  OTHER = "OTHER",
}
