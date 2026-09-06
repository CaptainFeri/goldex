/**
 * Which way money moved, as the operator entered it.
 *
 * This is the *only* thing the client says about direction. The accounting
 * side (بدهکار / بستانکار) is derived from it on the server and never accepted
 * from a request — a voucher whose stated side disagreed with its movement
 * would be a booking error that reconciles to nothing.
 */
export enum VoucherMovement {
  /** Money into the customer's account with us. */
  DEPOSIT = "deposit",
  /** Money out. */
  WITHDRAW = "withdraw",
}

/**
 * The accounting nature of the entry, derived from the movement.
 *
 * A deposit increases what the platform owes the customer, so the customer
 * stands as creditor; a withdrawal reduces it and they stand as debtor.
 */
export enum VoucherSide {
  /** بدهکار */
  DEBTOR = "debtor",
  /** بستانکار */
  CREDITOR = "creditor",
}

/** Draft → awaiting approval → booked, or refused. */
export enum VoucherStatus {
  /** پیش‌نویس — editable, not yet submitted. */
  DRAFT = "draft",
  /** در انتظار تایید — submitted, awaiting a second operator. */
  PENDING = "pending",
  /** ثبت نهایی — booked; immutable from here. */
  FINALIZED = "finalized",
  /** رد شده */
  REJECTED = "rejected",
}

/** Whether the counterparty is an invoiced entity or not. */
export enum CustomerType {
  FORMAL = "formal",
  INFORMAL = "informal",
}

/** What the entry is for. Fixed list — the panel renders it as a select. */
export enum VoucherCategory {
  FEE = "fee",
  CUSTOMER_SETTLEMENT = "customer_settlement",
  ACCOUNT_CORRECTION = "account_correction",
  DEPOSIT_ENTRY = "deposit_entry",
  WITHDRAW_ENTRY = "withdraw_entry",
  OPERATING_COST = "operating_cost",
}

/** Which balance bucket of the wallet the entry touches. */
export enum WalletSubset {
  /** نقد */
  CASH = "cash",
  /** اعتبار */
  CREDIT = "credit",
  /** فریز */
  FROZEN = "frozen",
}

/** What the accounting series plots. */
export enum AccountingMetric {
  INCOME = "income",
  EXPENSE = "expense",
  PROFIT = "profit",
  MARGIN = "margin",
}

/** How the series is bucketed. */
export enum AccountingGranularity {
  MONTH = "month",
  DAY = "day",
  HOUR = "hour",
}

export const VOUCHER_CATEGORY_LABELS: Record<VoucherCategory, string> = {
  [VoucherCategory.FEE]: "کارمزد",
  [VoucherCategory.CUSTOMER_SETTLEMENT]: "تسویه مشتری",
  [VoucherCategory.ACCOUNT_CORRECTION]: "اصلاح حساب",
  [VoucherCategory.DEPOSIT_ENTRY]: "ثبت واریز",
  [VoucherCategory.WITHDRAW_ENTRY]: "ثبت برداشت",
  [VoucherCategory.OPERATING_COST]: "هزینه عملیاتی",
};

export const WALLET_SUBSET_LABELS: Record<WalletSubset, string> = {
  [WalletSubset.CASH]: "نقد",
  [WalletSubset.CREDIT]: "اعتبار",
  [WalletSubset.FROZEN]: "فریز",
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  [VoucherStatus.DRAFT]: "پیش‌نویس",
  [VoucherStatus.PENDING]: "در انتظار تایید",
  [VoucherStatus.FINALIZED]: "ثبت نهایی",
  [VoucherStatus.REJECTED]: "رد شده",
};

export const VOUCHER_SIDE_LABELS: Record<VoucherSide, string> = {
  [VoucherSide.DEBTOR]: "بدهکار",
  [VoucherSide.CREDITOR]: "بستانکار",
};
