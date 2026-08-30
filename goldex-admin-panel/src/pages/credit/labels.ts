import type { Credit } from "../../api/types";

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  SUSPENDED: "تعلیق شده",
  SETTLED: "تسویه شده",
  EXPIRED: "منقضی شده",
  CANCELLED: "لغو شده",
};
export const STATUS_KINDS: Record<string, string> = {
  PENDING: "gold",
  ACTIVE: "green",
  SUSPENDED: "red",
  SETTLED: "blue",
  EXPIRED: "gray",
  CANCELLED: "red",
};

export const SETTLEMENT_STATE_LABELS: Record<string, string> = {
  GREEN: "سبز",
  YELLOW: "زرد",
  RED: "قرمز",
  ADMIN_REVIEW: "بررسی ادمین",
  AUTO_LIQUIDATION: "نقد خودکار",
  SETTLED: "تسویه شده",
};
export const SETTLEMENT_STATE_KINDS: Record<string, string> = {
  GREEN: "green",
  YELLOW: "gold",
  RED: "red",
  ADMIN_REVIEW: "blue",
  AUTO_LIQUIDATION: "gray",
  SETTLED: "blue",
};

export const SETTLEMENT_METHOD_LABELS: Record<string, string> = {
  FULL: "بازپرداخت کامل",
  NET: "خالص‌سازی (Net)",
  TOPUP: "تأمین نقدی کسری",
};

export const RISK_STATE_LABELS: Record<string, string> = {
  NORMAL: "عادی",
  WARNING: "هشدار",
  MARGIN_CALL: "فراخوان سرمایه",
  REDUCING: "کاهش",
  LIQUIDATING: "نقد شدن",
  LIQUIDATED: "نقد شده",
  SETTLED: "تسویه شده",
  DEFAULT: "پیش‌فرض",
};
export const RISK_STATE_KINDS: Record<string, string> = {
  NORMAL: "green",
  WARNING: "gold",
  MARGIN_CALL: "red",
  REDUCING: "gold",
  LIQUIDATING: "red",
  LIQUIDATED: "gray",
  SETTLED: "blue",
  DEFAULT: "red",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  PARTIALLY_COMPLETED: "نیمه انجام",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
  REJECTED: "رد شده",
};

export const CREDIT_ORDER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "فعال",
  MARGIN_CALLED: "فراخوان",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
  CLOSED: "بسته شده",
  CASHED_OUT: "نقد شده",
};

export const CASHOUT_SOURCE_LABELS: Record<string, string> = {
  DEPOSIT: "کیف پول واریزی",
  COLLATERAL: "وثیقه بلوکه‌شده",
};

/** Why a purchase (or a payment source) can't be cashed out right now. */
export const CASHOUT_REASON_LABELS: Record<string, string> = {
  CREDIT_NOT_ACTIVE: "اعتبار فعال نیست",
  CASHOUT_NOT_SUPPORTED_FOR_LEGACY_CREDIT: "اعتبار قدیمی (ایجادشده توسط ادمین) — فقط قابل تسویه است",
  CASHOUT_ASSET_NOT_HELD: "دارایی خریداری‌شده در کیف پول اعتباری موجود نیست",
  CREDIT_NO_MARK_PRICE: "قیمت زنده وثیقه در دسترس نیست",
  CASHOUT_COLLATERAL_BLOCKED_MARGIN_CALL: "اعتبار در وضعیت فراخوان سرمایه است",
  CASHOUT_COLLATERAL_BLOCKED_DEFAULT: "اعتبار کسری تسویه‌نشده دارد",
};

export const fmtNum = (n: any) => (n ?? 0).toLocaleString("fa-IR");
export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// A credit that triggered a margin call stays ACTIVE but all the user's wallets
// are frozen (blocked) until the admin settles/cancels it. Detect it from the
// linked credit orders.
export const isMarginCalled = (c: Credit) =>
  c.status === "ACTIVE" && (c.creditOrders || []).some((o) => o?.status === "MARGIN_CALLED");
