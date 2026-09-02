import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { DepositTypeEnum } from "../enum/deposit-type.enum";
import { WithdrawTypeEnum } from "../enum/withdraw-type.enum";

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
 * of the manual (image proof) flow. Selecting one of these requires the
 * symbol to carry at least one gateway for that direction.
 */
export const GATEWAY_BOUND_TYPES: ReadonlySet<string> = new Set([
  DepositTypeEnum.PAYMENT_GATEWAY,
  WithdrawTypeEnum.AUTO,
]);

export const GATEWAY_BOUND_DEPOSIT_TYPES: DepositTypeEnum[] = [DepositTypeEnum.PAYMENT_GATEWAY];
export const GATEWAY_BOUND_WITHDRAW_TYPES: WithdrawTypeEnum[] = [WithdrawTypeEnum.AUTO];

/**
 * Which goldex-cbp gateway categories may serve a symbol of each type.
 *
 * Not a strict equality with the symbol type: rial and fiat symbols both move
 * money and either a rial gateway (shahin) or a fiat one (kaino) can carry
 * them. It does keep a crypto gateway off a rial symbol, and material symbols
 * never touch a gateway at all.
 */
export const SYMBOL_TYPE_GATEWAY_CATEGORIES: Record<SymbolTypeEnum, string[]> = {
  [SymbolTypeEnum.RIAL]: ["rial", "fiat"],
  [SymbolTypeEnum.FIAT]: ["rial", "fiat"],
  [SymbolTypeEnum.CRYPTO]: ["crypto"],
  [SymbolTypeEnum.MATERIAL]: [],
};

/**
 * Default gateway provider codes per symbol type, for the gateway-bound
 * deposit/withdraw types (deposit "payment-gateway" -> deposit gateways,
 * withdraw "auto" -> withdraw gateways).
 *  - RIAL: deposit via kaino (informal wallet), withdraw via shahin (bank).
 *
 * These are only pre-selections for a new symbol. What is actually allowed is
 * decided by SYMBOL_TYPE_GATEWAY_CATEGORIES against the live registry, so
 * adding a gateway to cbp makes it selectable without touching this file.
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

export function getDefaultDepositTypes(symbolType: SymbolTypeEnum): DepositTypeEnum[] {
  return [...(SYMBOL_TYPE_DEPOSIT_MAP[symbolType] ?? [])] as DepositTypeEnum[];
}

export function getDefaultWithdrawTypes(symbolType: SymbolTypeEnum): WithdrawTypeEnum[] {
  return [...(SYMBOL_TYPE_WITHDRAW_MAP[symbolType] ?? [])] as WithdrawTypeEnum[];
}

/** Gateway categories a symbol of this type may draw from. */
export function getEligibleGatewayCategories(symbolType: SymbolTypeEnum): string[] {
  return [...(SYMBOL_TYPE_GATEWAY_CATEGORIES[symbolType] ?? [])];
}

/** Whether at least one of the selected types needs a gateway configured. */
export function requiresGateway(types: readonly string[]): boolean {
  return types.some((t) => GATEWAY_BOUND_TYPES.has(t));
}

export function validateDepositTypes(symbolType: SymbolTypeEnum, types: string[]): string | null {
  const allowed = SYMBOL_TYPE_DEPOSIT_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t as DepositTypeEnum))
      return `Deposit type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0) return `At least one deposit type is required for symbol type "${symbolType}"`;
  return null;
}

export function validateWithdrawTypes(symbolType: SymbolTypeEnum, types: string[]): string | null {
  const allowed = SYMBOL_TYPE_WITHDRAW_MAP[symbolType];
  if (!allowed) return `Unknown symbol type: ${symbolType}`;
  for (const t of types) {
    if (!allowed.includes(t as WithdrawTypeEnum))
      return `Withdraw type "${t}" is not allowed for symbol type "${symbolType}". Allowed: ${allowed.join(", ")}`;
  }
  if (types.length === 0) return `At least one withdraw type is required for symbol type "${symbolType}"`;
  return null;
}
