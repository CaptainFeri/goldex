import { SymbolTypeEnum } from "../enum/symbol.type.enum";

/**
 * MIRROR of goldex-backend's
 * `src/admin-symbol/constants/symbol-type-type-map.ts`, which owns these rules.
 * cbp keeps its own copy because it is a separate deployable and must be able
 * to refuse a configuration it cannot honour.
 *
 * If the two drift, a `symbol.sync` carrying a type this map rejects fails in
 * SymbolSyncConsumer with the allowed list in the message — that log is the
 * signal to reconcile the two files, starting from the backend's.
 */

export const SYMBOL_TYPE_DEPOSIT_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["manual", "payment-gateway"],
  [SymbolTypeEnum.CRYPTO]: ["manual", "hdwallet"],
  [SymbolTypeEnum.FIAT]: ["manual", "payment-gateway"],
  [SymbolTypeEnum.MATERIAL]: ["warehouse", "borrow"],
};

export const SYMBOL_TYPE_WITHDRAW_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["manual", "auto"],
  [SymbolTypeEnum.CRYPTO]: ["manual", "auto"],
  [SymbolTypeEnum.FIAT]: ["manual", "auto"],
  [SymbolTypeEnum.MATERIAL]: ["warehouse", "borrow"],
};

/**
 * Types that are bound to a payment gateway provider instead of the
 * manual (image proof) flow. When a request arrives with one of these
 * types, the gateway is resolved from the symbol config and called.
 */
export const GATEWAY_BOUND_TYPES: ReadonlySet<string> = new Set([
  "payment-gateway",
  "auto",
]);

export function getDefaultDepositTypes(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_DEPOSIT_MAP[symbolType] ?? [])];
}

export function getDefaultWithdrawTypes(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_WITHDRAW_MAP[symbolType] ?? [])];
}

export function validateDepositTypes(
  symbolType: SymbolTypeEnum,
  types: string[],
): string | null {
  const allowed = SYMBOL_TYPE_DEPOSIT_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t))
      return `Deposit type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0)
    return `At least one deposit type is required for symbol type "${symbolType}"`;
  return null;
}

export function validateWithdrawTypes(
  symbolType: SymbolTypeEnum,
  types: string[],
): string | null {
  const allowed = SYMBOL_TYPE_WITHDRAW_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t))
      return `Withdraw type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0)
    return `At least one withdraw type is required for symbol type "${symbolType}"`;
  return null;
}
