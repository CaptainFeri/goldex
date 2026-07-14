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
