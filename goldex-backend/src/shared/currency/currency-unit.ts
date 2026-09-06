/**
 * The platform's books are kept in Iranian Rial. Providers, however, quote in
 * whichever unit their own panel uses — Rial or Toman, which differ by a factor
 * of ten — so every provider declares its unit and amounts are converted on the
 * way in. Nothing stored or reported is denominated in Toman.
 */
export enum CurrencyUnit {
  RIAL = "IRR",
  TOMAN = "TOMAN",
}

/** One Toman is ten Rial. */
export const RIAL_PER_TOMAN = 10;

/** Providers historically quoted Toman, so that stays the default reading. */
export const DEFAULT_PROVIDER_PRICE_UNIT = CurrencyUnit.TOMAN;

export function isCurrencyUnit(value: unknown): value is CurrencyUnit {
  return value === CurrencyUnit.RIAL || value === CurrencyUnit.TOMAN;
}

/** Normalizes a declared unit, defaulting when it is unset or unrecognized. */
export function resolvePriceUnit(value: unknown): CurrencyUnit {
  const upper = typeof value === "string" ? value.toUpperCase() : value;
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

/** Converts a Rial amount into `unit` — for display only, never for storage. */
export function fromRial(amount: number, unit: CurrencyUnit): number {
  if (!Number.isFinite(amount)) return amount;
  return amount / rialFactor(unit);
}
