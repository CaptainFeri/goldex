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
export const PAYMENT_GATEWAYS = [
  { value: "up", label: "آسان‌پرداخت" },
  { value: "mellat", label: "ملت" },
  { value: "pasargad", label: "پاسارگاد" },
  { value: "custom", label: "سفارشی (غیررسمی)" },
];

export const MARKET_TYPES_ENUM = [
  { value: "formal", label: "رسمی" },
  { value: "informal", label: "غیررسمی" },
];
export const MARKET_TYPES = [
  { value: "formal", label: "رسمی" },
  { value: "informal", label: "غیررسمی" },
];

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

// Map symbol type to allowed deposit types (for auto-select)
export const SYMBOL_TYPE_DEPOSIT_MAP: Record<string, string[]> = {
  rial: ["manual", "payment-gateway"],
  crypto: ["manual", "hdwallet"],
  fiat: ["manual", "payment-gateway"],
  material: ["warehouse", "borrow"],
};

// Map symbol type to allowed withdraw types (for auto-select)
export const SYMBOL_TYPE_WITHDRAW_MAP: Record<string, string[]> = {
  rial: ["manual", "auto"],
  crypto: ["manual", "auto"],
  fiat: ["manual", "auto"],
  material: ["warehouse", "borrow"],
};
