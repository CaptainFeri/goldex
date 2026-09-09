/**
 * The unit boundary of this service.
 *
 * The channels this service reads publish gold prices in **Toman**, the
 * colloquial unit. Everything else in the platform — the backend ledger, the
 * pricing engine, the admin panel — is denominated in **Rial**, so a Toman
 * figure is converted once, where it enters (`parsePriceMessage`), and every
 * balance, fee, spread and report below that point is Rial.
 *
 * Nothing downstream should convert again. `rialToToman` exists only for the
 * rare surface that has to echo a channel's own number back.
 */

/** One Toman is ten Rial. */
export const RIAL_PER_TOMAN = 10;

/** A figure quoted by a channel (Toman) → the Rial this service works in. */
export function tomanToRial(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  return amount * RIAL_PER_TOMAN;
}

/** A Rial figure → the Toman a channel would have written. */
export function rialToToman(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  return amount / RIAL_PER_TOMAN;
}

/**
 * Reads a money-valued environment variable that used to be given in Toman.
 *
 * The Rial-named variable wins. A leftover Toman-named one is converted rather
 * than read as Rial, so an existing deployment keeps the amount it configured
 * instead of silently running at a tenth of it.
 */
export function moneyFromEnv(
  rialVar: string | undefined,
  legacyTomanVar: string | undefined,
  defaultRial: number,
): number {
  const rial = Number(rialVar);
  if (Number.isFinite(rial) && rial > 0) return rial;
  const toman = Number(legacyTomanVar);
  if (Number.isFinite(toman) && toman > 0) return tomanToRial(toman);
  return defaultRial;
}
