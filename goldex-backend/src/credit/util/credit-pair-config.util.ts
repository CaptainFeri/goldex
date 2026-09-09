import { CreditPairConfig } from "../dto/credit-pair-config.dto";
import { CreditEnforceModeEnum } from "../enum/credit-enforce-mode.enum";

/**
 * The level-wide credit defaults a per-pair config may override. Both the
 * `UserLevelEntity` and the snapshot a facility carries in its metadata satisfy
 * this shape, so the same resolution runs at facility creation and at order
 * time — a facility keeps the terms it was opened under.
 */
export interface CreditLevelDefaults {
  creditTradingEnabled?: boolean | null;
  creditMaxLeverage?: number | null;
  creditDrawdownPercent?: number | null;
  creditEnforceOnDrawdown?: CreditEnforceModeEnum | null;
  creditWarningMarginPercent?: number | null;
  creditMarginCallPercent?: number | null;
  creditLiquidationMarginPercent?: number | null;
  creditReduceOnlyOnWarning?: boolean | null;
  creditEnforceOnExpiry?: CreditEnforceModeEnum | null;
  creditEnforceRequestDeadline?: boolean | null;
  creditMaxParallelRequests?: number | null;
  creditMaxExecutionLevel?: number | null;
  creditMaxNotional?: number | null;
  creditMaxLockedCollateral?: number | null;
  creditMinTradeSize?: number | null;
  creditMaxTradeSize?: number | null;
  // Terms read when a facility is opened, resolved against the pair the
  // collateral is valued on.
  creditRequireKyc?: boolean | null;
  creditMaxAmount?: number | null;
  creditMaxDurationDays?: number | null;
}

/** Every credit rule that applies to one pair, after the level fallback. */
export type ResolvedCreditPairConfig = {
  [K in keyof CreditLevelDefaults]-?: CreditLevelDefaults[K] extends infer T
    ? Exclude<T, null | undefined> | null
    : never;
};

const NUMERIC_KEYS = [
  "creditMaxLeverage",
  "creditDrawdownPercent",
  "creditWarningMarginPercent",
  "creditMarginCallPercent",
  "creditLiquidationMarginPercent",
  "creditMaxParallelRequests",
  "creditMaxExecutionLevel",
  "creditMaxNotional",
  "creditMaxLockedCollateral",
  "creditMinTradeSize",
  "creditMaxTradeSize",
  "creditMaxAmount",
  "creditMaxDurationDays",
] as const;

const BOOLEAN_KEYS = [
  "creditTradingEnabled",
  "creditReduceOnlyOnWarning",
  "creditEnforceRequestDeadline",
  "creditRequireKyc",
] as const;

const ENUM_KEYS = ["creditEnforceOnDrawdown", "creditEnforceOnExpiry"] as const;

/**
 * The first value that was actually configured. `undefined` and `null` both
 * mean "not set here" — a level that leaves a rule blank defers to nothing, so
 * the rule is simply not enforced.
 */
function firstSet<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Merge the per-pair credit config over the level defaults.
 *
 * `configs` is the level's `creditConfigs` jsonb: it comes back from Postgres
 * untyped and its numbers may be strings, so each rule is coerced on the way
 * out and a malformed entry degrades to the level default rather than throwing
 * inside the order path.
 */
export function resolveCreditPairConfig(
  defaults: CreditLevelDefaults | null | undefined,
  configs: Record<string, CreditPairConfig> | null | undefined,
  pairId: string | null | undefined,
): ResolvedCreditPairConfig {
  const base = defaults ?? {};
  const pair: CreditPairConfig = (pairId && configs?.[pairId]) || {};
  const resolved = {} as ResolvedCreditPairConfig;

  for (const key of NUMERIC_KEYS) {
    resolved[key] = firstSet(toNumber(pair[key]), toNumber(base[key])) as never;
  }
  for (const key of BOOLEAN_KEYS) {
    const value = firstSet(pair[key], base[key]);
    resolved[key] = (value === null ? null : !!value) as never;
  }
  for (const key of ENUM_KEYS) {
    resolved[key] = firstSet(pair[key], base[key]) as never;
  }
  return resolved;
}

/**
 * Credit trading follows an opt-out model: a level that never configured the
 * flag still permits it, and only an explicit `false` — on the pair or on the
 * level — turns it off.
 */
export function isCreditTradingAllowed(resolved: ResolvedCreditPairConfig): boolean {
  return resolved.creditTradingEnabled !== false;
}

/**
 * The level defaults a facility was opened under.
 *
 * `requestCredit` snapshots the level onto the facility so its terms cannot
 * shift under an open position. Facilities opened before the snapshot existed
 * (and admin-created ones) fall back to the columns the facility does carry, so
 * the resolver behaves identically for them.
 */
export function creditDefaultsFromFacility(credit: {
  drawdownPercent?: number | null;
  enforceOnDrawdown?: CreditEnforceModeEnum | null;
  enforceOnExpiry?: CreditEnforceModeEnum | null;
  enforceRequestDeadline?: boolean | null;
  leverage?: number | null;
  maxCreditNotional?: number | null;
  maxTotalLockedCollateral?: number | null;
  maxConcurrentOrders?: number | null;
  maxTradeChainDepth?: number | null;
  metadata?: Record<string, unknown> | null;
}): CreditLevelDefaults {
  const snapshot = (credit.metadata?.creditLevelDefaults ?? null) as CreditLevelDefaults | null;
  if (snapshot) return snapshot;
  return {
    creditMaxLeverage: credit.leverage ?? null,
    creditDrawdownPercent: credit.drawdownPercent ?? null,
    creditEnforceOnDrawdown: credit.enforceOnDrawdown ?? null,
    creditEnforceOnExpiry: credit.enforceOnExpiry ?? null,
    creditEnforceRequestDeadline: credit.enforceRequestDeadline ?? null,
    creditMaxParallelRequests:
      (credit.metadata?.maxParallelRequests as number | undefined) ??
      credit.maxConcurrentOrders ??
      null,
    creditMaxExecutionLevel: credit.maxTradeChainDepth ?? null,
    creditMaxNotional: credit.maxCreditNotional ?? null,
    creditMaxLockedCollateral: credit.maxTotalLockedCollateral ?? null,
  };
}

/** Resolve the rules for one pair straight from a facility. */
export function resolveFacilityPairConfig(
  credit: Parameters<typeof creditDefaultsFromFacility>[0] & {
    metadata?: Record<string, unknown> | null;
  },
  pairId: string | null | undefined,
): ResolvedCreditPairConfig {
  return resolveCreditPairConfig(
    creditDefaultsFromFacility(credit),
    (credit.metadata?.creditConfigs ?? null) as Record<string, CreditPairConfig> | null,
    pairId,
  );
}

/**
 * The level's credit rules, frozen onto a facility at creation.
 *
 * A facility must keep the terms it was granted under: re-tuning a level should
 * govern the next facility, not silently re-price an open position. Numbers
 * come off the entity as strings (Postgres `decimal`), so they are coerced here
 * once rather than at every read.
 */
export function snapshotCreditLevelDefaults(level: {
  creditTradingEnabled?: boolean | null;
  creditMaxLeverage?: number | null;
  creditDrawdownPercent?: number | null;
  creditEnforceOnDrawdown?: CreditEnforceModeEnum | null;
  creditWarningMarginPercent?: number | null;
  creditMarginCallPercent?: number | null;
  creditLiquidationMarginPercent?: number | null;
  creditReduceOnlyOnWarning?: boolean | null;
  creditEnforceOnExpiry?: CreditEnforceModeEnum | null;
  creditEnforceRequestDeadline?: boolean | null;
  creditMaxParallelRequests?: number | null;
  creditMaxExecutionLevel?: number | null;
  creditMaxNotional?: number | null;
  creditMaxLockedCollateral?: number | null;
  creditMinTradeSize?: number | null;
  creditMaxTradeSize?: number | null;
  creditRequireKyc?: boolean | null;
  creditMaxAmount?: number | null;
  creditMaxDurationDays?: number | null;
}): CreditLevelDefaults {
  const num = (v: unknown) => toNumber(v);
  const bool = (v: unknown) => (v === undefined || v === null ? null : !!v);
  return {
    creditTradingEnabled: bool(level.creditTradingEnabled),
    creditMaxLeverage: num(level.creditMaxLeverage),
    creditDrawdownPercent: num(level.creditDrawdownPercent),
    creditEnforceOnDrawdown: level.creditEnforceOnDrawdown ?? null,
    creditWarningMarginPercent: num(level.creditWarningMarginPercent),
    creditMarginCallPercent: num(level.creditMarginCallPercent),
    creditLiquidationMarginPercent: num(level.creditLiquidationMarginPercent),
    creditReduceOnlyOnWarning: bool(level.creditReduceOnlyOnWarning),
    creditEnforceOnExpiry: level.creditEnforceOnExpiry ?? null,
    creditEnforceRequestDeadline: bool(level.creditEnforceRequestDeadline),
    creditMaxParallelRequests: num(level.creditMaxParallelRequests),
    creditMaxExecutionLevel: num(level.creditMaxExecutionLevel),
    creditMaxNotional: num(level.creditMaxNotional),
    creditMaxLockedCollateral: num(level.creditMaxLockedCollateral),
    creditMinTradeSize: num(level.creditMinTradeSize),
    creditMaxTradeSize: num(level.creditMaxTradeSize),
    creditRequireKyc: bool(level.creditRequireKyc),
    creditMaxAmount: num(level.creditMaxAmount),
    creditMaxDurationDays: num(level.creditMaxDurationDays),
  };
}
