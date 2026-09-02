import { SymbolTypeEnum } from "../enum/symbol.type.enum";

export const SYMBOL_TYPE_DEPOSIT_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["manual", "payment-gateway", "p2p"],
  [SymbolTypeEnum.CRYPTO]: ["manual", "hdwallet"],
  [SymbolTypeEnum.FIAT]: ["manual", "payment-gateway"],
  [SymbolTypeEnum.MATERIAL]: ["warehouse", "borrow"],
};

export const SYMBOL_TYPE_WITHDRAW_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["manual", "auto", "p2p"],
  [SymbolTypeEnum.CRYPTO]: ["manual", "auto"],
  [SymbolTypeEnum.FIAT]: ["manual", "auto"],
  [SymbolTypeEnum.MATERIAL]: ["warehouse", "borrow"],
};

/**
 * Types that are bound to a payment gateway provider (goldex-cbp) instead
 * of the manual (image proof) flow.
 */
export const GATEWAY_BOUND_TYPES: ReadonlySet<string> = new Set([
  "payment-gateway",
  "auto",
]);

/**
 * Default gateway provider codes per symbol type, for the gateway-bound
 * deposit/withdraw types (deposit "payment-gateway" -> deposit gateways,
 * withdraw "auto" -> withdraw gateways).
 *  - RIAL: deposit via kaino (informal wallet), withdraw via shahin (bank).
 */
export const SYMBOL_TYPE_DEPOSIT_GATEWAY_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["kaino-informal"],
  [SymbolTypeEnum.FIAT]: ["kaino-informal"],
  [SymbolTypeEnum.CRYPTO]: [],
  [SymbolTypeEnum.MATERIAL]: [],
};

export const SYMBOL_TYPE_WITHDRAW_GATEWAY_MAP: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["shahin"],
  [SymbolTypeEnum.FIAT]: ["shahin"],
  [SymbolTypeEnum.CRYPTO]: [],
  [SymbolTypeEnum.MATERIAL]: [],
};

export function getDefaultDepositGateways(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_DEPOSIT_GATEWAY_MAP[symbolType] ?? [])];
}

export function getDefaultWithdrawGateways(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_WITHDRAW_GATEWAY_MAP[symbolType] ?? [])];
}

export function getDefaultDepositTypes(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_DEPOSIT_MAP[symbolType] ?? [])];
}

export function getDefaultWithdrawTypes(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_WITHDRAW_MAP[symbolType] ?? [])];
}

export function validateDepositTypes(symbolType: SymbolTypeEnum, types: string[]): string | null {
  const allowed = SYMBOL_TYPE_DEPOSIT_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t)) return `Deposit type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0) return `At least one deposit type is required for symbol type "${symbolType}"`;
  return null;
}

export function validateWithdrawTypes(symbolType: SymbolTypeEnum, types: string[]): string | null {
  const allowed = SYMBOL_TYPE_WITHDRAW_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t)) return `Withdraw type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0) return `At least one withdraw type is required for symbol type "${symbolType}"`;
  return null;
}
