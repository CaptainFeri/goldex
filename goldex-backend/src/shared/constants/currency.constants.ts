/**
 * The platform's rial-family unit.
 *
 * Everything above the bank adapters — wallets, orders, credits, vouchers, the
 * whole admin API — is denominated in **toman (IRT)**. The `IRR` symbol row was
 * replaced by `IRT` and every stored balance converted once, by migration.
 *
 * Never write the literal "IRR" or "IRT" in application code; import from here
 * so the next unit change is one edit rather than a grep.
 *
 * @see docs/PARSZARGAR-ADMIN-API-PLAN.md §3.1
 */
export const RIAL_SYMBOL_SLUG = "IRT" as const;

/** Human-readable unit for the API's money metadata (`{ amount, currency, unit }`). */
export const RIAL_SYMBOL_UNIT = "تومان" as const;

/**
 * What the bank rails speak. SATNA, PAYA, Shahin and the CBP gateways all
 * settle in rial, and that is not ours to change — so adapters convert at their
 * own edge and nowhere else.
 *
 * @see docs/PARSZARGAR-ADMIN-API-PLAN.md §3.2
 */
export const BANK_SYMBOL_SLUG = "IRR" as const;

/** 1 toman = 10 rial. */
export const RIAL_PER_TOMAN = 10 as const;
