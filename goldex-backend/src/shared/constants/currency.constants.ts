/**
 * The rial-family symbol, as stored.
 *
 * **The backend works in rial (IRR), end to end.** Balances, orders, credits,
 * vouchers, the bank rails and the wire format are all rial — one unit, no
 * conversion anywhere in the platform, and no factor-of-ten hazard in the data.
 *
 * Toman is a **display** convention and belongs to the panels: they divide by
 * `RIAL_PER_TOMAN` when rendering and multiply when accepting input. Nothing in
 * this codebase should convert.
 *
 * Never write the literal "IRR" in application code; import from here so the
 * next unit change is one edit rather than a grep.
 *
 * @see docs/PARSZARGAR-ADMIN-API-PLAN.md §3.1
 */
export const RIAL_SYMBOL_SLUG = "IRR" as const;

/** The unit the API reports in its money metadata (`{ amount, currency }`). */
export const RIAL_SYMBOL_UNIT = "ریال" as const;

/**
 * How the panels present rial amounts.
 *
 * Served to clients (see the platform settings endpoint) so both panels format
 * identically instead of each hardcoding a divisor.
 */
export const DISPLAY_CURRENCY = "IRT" as const;
export const DISPLAY_CURRENCY_UNIT = "تومان" as const;

/** 1 toman = 10 rial. Display-side only. */
export const RIAL_PER_TOMAN = 10 as const;
