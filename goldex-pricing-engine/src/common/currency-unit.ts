/**
 * Iranian price quotes arrive in two units: Rial, the legal currency, and
 * Toman, the colloquial one worth ten Rial. Providers publish in whichever
 * their own panel uses, so every provider declares its unit and the engine
 * converts on the way in.
 *
 * Everything downstream of `toRial` — Redis, RabbitMQ, arbitrage, the backend
 * ledger — is denominated in Rial and nothing else.
 */
export enum CurrencyUnit {
  RIAL = 'IRR',
  TOMAN = 'TOMAN',
}

/** One Toman is ten Rial. */
export const RIAL_PER_TOMAN = 10;

/** Providers historically quoted Toman, so that stays the default reading. */
export const DEFAULT_PROVIDER_PRICE_UNIT = CurrencyUnit.TOMAN;

export function isCurrencyUnit(value: unknown): value is CurrencyUnit {
  return value === CurrencyUnit.RIAL || value === CurrencyUnit.TOMAN;
}

/** Normalizes a provider's declared unit, defaulting when it is unset or junk. */
export function resolvePriceUnit(value: unknown): CurrencyUnit {
  const upper = typeof value === 'string' ? value.toUpperCase() : value;
  return isCurrencyUnit(upper) ? upper : DEFAULT_PROVIDER_PRICE_UNIT;
}

/** How many Rial one unit of `unit` is worth. */
export function rialFactor(unit: CurrencyUnit): number {
  return unit === CurrencyUnit.TOMAN ? RIAL_PER_TOMAN : 1;
}

/** Converts an amount quoted in `unit` into Rial. */
export function toRial(amount: number, unit: CurrencyUnit): number {
  if (!Number.isFinite(amount)) return amount;
  return amount * rialFactor(unit);
}

/** Formats a Rial amount the way the panels and logs display it. */
export function formatRial(amount: number): string {
  return `${Math.round(amount).toLocaleString('fa-IR')} ریال`;
}

/**
 * Reads a unit off a Persian label a provider API returns ("ریال" / "تومان").
 * Returns null when the label says neither, so the caller can fall back to the
 * provider's declared unit instead of guessing.
 */
export function unitFromPersianLabel(label: unknown): CurrencyUnit | null {
  if (typeof label !== 'string') return null;
  const normalized = label.replace(/\u200c/g, '').trim();
  if (normalized.includes('تومان')) return CurrencyUnit.TOMAN;
  if (normalized.includes('ریال') || normalized.includes('ريال')) return CurrencyUnit.RIAL;
  return null;
}
