// Mirrors the backend enums so the admin forms send valid values.
export const GAIN_TYPES = [
  { value: "number", label: "عدد ثابت" },
  { value: "percent", label: "درصد" },
];
export const SYMBOL_TYPES = [
  { value: "material", label: "کالا/فلز" },
  { value: "fiat", label: "ارز فیات" },
  { value: "crypto", label: "رمزارز" },
  { value: "rial", label: "ریال" },
];
export const UNIT_TYPES = [
  { value: "number", label: "عدد" },
  { value: "geram", label: "گرم" },
  { value: "litre", label: "لیتر" },
];

export const MARKET_TYPES_ENUM = [
  { value: "formal", label: "رسمی" },
  { value: "informal", label: "غیررسمی" },
];
export const MARKET_TYPES = [
  { value: "formal", label: "رسمی" },
  { value: "informal", label: "غیررسمی" },
];

export const MARKET_KINDS_ENUM = [
  { value: "MARKET", label: "بازار (Market)" },
  { value: "LIMIT", label: "محدود (Limit)" },
  { value: "OFFER", label: "پیشنهاد (Offer — تلگرام)" },
];

// Labels only. Which types a symbol type allows, and which need a gateway,
// comes from GET /admin/symbols/capabilities — the backend owns those rules.
export const DEPOSIT_TYPES = [
  { value: "manual", label: "دستی" },
  { value: "payment-gateway", label: "درگاه پرداخت" },
  { value: "p2p", label: "همتا به همتا (ریالی)" },
  { value: "hdwallet", label: "کیف پول HD" },
  { value: "warehouse", label: "انبار" },
  { value: "borrow", label: "اعتباری" },
];

export const WITHDRAW_TYPES = [
  { value: "manual", label: "دستی" },
  { value: "auto", label: "خودکار" },
  { value: "p2p", label: "همتا به همتا (ریالی)" },
  { value: "warehouse", label: "انبار" },
  { value: "borrow", label: "اعتباری" },
];

// Map symbol type to allowed deposit types (for auto-select)
export const SYMBOL_TYPE_DEPOSIT_MAP: Record<string, string[]> = {
  rial: ["manual", "payment-gateway", "p2p"],
  crypto: ["manual", "hdwallet"],
  fiat: ["manual", "payment-gateway"],
  material: ["warehouse", "borrow"],
};

// Map symbol type to allowed withdraw types (for auto-select)
export const SYMBOL_TYPE_WITHDRAW_MAP: Record<string, string[]> = {
  rial: ["manual", "auto", "p2p"],
  crypto: ["manual", "auto"],
  fiat: ["manual", "auto"],
  material: ["warehouse", "borrow"],
};

// ─── P2P (rial peer-to-peer settlement) ──────────────────────
export const P2P_ESCALATION_REASONS: Record<string, string> = {
  WITHDRAWER_REJECT: "رد توسط برداشت‌کننده",
  WITHDRAWER_NO_RESPONSE: "عدم پاسخ برداشت‌کننده",
  SETTLEMENT_TIMEOUT: "اتمام مهلت تسویه",
  RECEIPT_MISMATCH: "مغایرت رسید",
  DUPLICATE_PAYMENT: "پرداخت تکراری",
  ADMIN_ACCOUNT_UNAVAILABLE: "نبود حساب مدیر در دسترس",
};

export const P2P_RESOLUTIONS = [
  { value: "CONFIRM_PAYMENT", label: "تأیید پرداخت و تسویه" },
  { value: "REJECT_PAYMENT", label: "رد پرداخت" },
  { value: "REQUEST_MORE_EVIDENCE", label: "درخواست مدرک تکمیلی" },
  { value: "SETTLE_FROM_ADMIN", label: "تسویه از حساب مدیر" },
  { value: "REOPEN_MATCHING", label: "بازگشت به صف تطبیق" },
  { value: "CANCEL_REQUEST", label: "لغو درخواست" },
];

export const P2P_ESCALATION_STATUS: Record<string, string> = {
  OPEN: "باز",
  ASSIGNED: "ارجاع‌شده",
  RESOLVED: "تعیین‌تکلیف شده",
  VOID: "باطل",
};

export const P2P_MATCH_STATUS: Record<string, string> = {
  RESERVED: "رزرو شده",
  AWAITING_PAYMENT: "در انتظار پرداخت",
  PROOF_SUBMITTED: "رسید ثبت شد",
  WAITING_CONFIRMATION: "در انتظار تأیید برداشت‌کننده",
  CONFIRMED: "تأیید شده",
  REJECTED_BY_WITHDRAWER: "رد شده",
  RESPONSE_TIMEOUT: "عدم پاسخ",
  ESCALATED: "ارجاع به ادمین",
  RESERVATION_EXPIRED: "انقضای رزرو",
  CANCELLED: "لغو شده",
};

export const BANK_ACCOUNT_STATUS: Record<string, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  SUSPENDED: "معلق",
};

// ─── P2P (rial peer-to-peer settlement) ──────────────────────
export const P2P_ESCALATION_REASONS: Record<string, string> = {
  WITHDRAWER_REJECT: "رد توسط برداشت‌کننده",
  WITHDRAWER_NO_RESPONSE: "عدم پاسخ برداشت‌کننده",
  SETTLEMENT_TIMEOUT: "اتمام مهلت تسویه",
  RECEIPT_MISMATCH: "مغایرت رسید",
  DUPLICATE_PAYMENT: "پرداخت تکراری",
  ADMIN_ACCOUNT_UNAVAILABLE: "نبود حساب مدیر در دسترس",
};

export const P2P_RESOLUTIONS = [
  { value: "CONFIRM_PAYMENT", label: "تأیید پرداخت و تسویه" },
  { value: "REJECT_PAYMENT", label: "رد پرداخت" },
  { value: "REQUEST_MORE_EVIDENCE", label: "درخواست مدرک تکمیلی" },
  { value: "SETTLE_FROM_ADMIN", label: "تسویه از حساب مدیر" },
  { value: "REOPEN_MATCHING", label: "بازگشت به صف تطبیق" },
  { value: "CANCEL_REQUEST", label: "لغو درخواست" },
];

export const P2P_ESCALATION_STATUS: Record<string, string> = {
  OPEN: "باز",
  ASSIGNED: "ارجاع‌شده",
  RESOLVED: "تعیین‌تکلیف شده",
  VOID: "باطل",
};

export const P2P_MATCH_STATUS: Record<string, string> = {
  RESERVED: "رزرو شده",
  AWAITING_PAYMENT: "در انتظار پرداخت",
  PROOF_SUBMITTED: "رسید ثبت شد",
  WAITING_CONFIRMATION: "در انتظار تأیید برداشت‌کننده",
  CONFIRMED: "تأیید شده",
  REJECTED_BY_WITHDRAWER: "رد شده",
  RESPONSE_TIMEOUT: "عدم پاسخ",
  ESCALATED: "ارجاع به ادمین",
  RESERVATION_EXPIRED: "انقضای رزرو",
  CANCELLED: "لغو شده",
};

export const BANK_ACCOUNT_STATUS: Record<string, string> = {
  ACTIVE: "فعال",
  INACTIVE: "غیرفعال",
  SUSPENDED: "معلق",
};
