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
  { value: "hdwallet", label: "کیف پول HD" },
  { value: "warehouse", label: "انبار" },
  { value: "borrow", label: "اعتباری" },
];

export const WITHDRAW_TYPES = [
  { value: "manual", label: "دستی" },
  { value: "auto", label: "خودکار" },
  { value: "warehouse", label: "انبار" },
  { value: "borrow", label: "اعتباری" },
];

const DEPOSIT_TYPE_LABELS = new Map(DEPOSIT_TYPES.map((o) => [o.value, o.label]));
const WITHDRAW_TYPE_LABELS = new Map(WITHDRAW_TYPES.map((o) => [o.value, o.label]));

export function depositTypeLabel(value: string): string {
  return DEPOSIT_TYPE_LABELS.get(value) ?? value;
}

export function withdrawTypeLabel(value: string): string {
  return WITHDRAW_TYPE_LABELS.get(value) ?? value;
}

// Gateway health as reported by goldex-cbp.
export const GATEWAY_STATUS_LABELS: Record<string, { label: string; kind: "green" | "red" | "gold" | "gray" }> = {
  up: { label: "در دسترس", kind: "green" },
  down: { label: "قطع", kind: "red" },
  not_configured: { label: "پیکربندی نشده", kind: "gold" },
  unknown: { label: "نامشخص", kind: "gray" },
};
