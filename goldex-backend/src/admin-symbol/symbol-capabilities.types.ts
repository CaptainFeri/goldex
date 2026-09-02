import { SymbolTypeEnum } from "./enum/symbol.type.enum";

/** One goldex-cbp gateway, as registered there and (when known) its health. */
export interface GatewayOption {
  code: string;
  name: string;
  /** rial | fiat | crypto | material */
  category: string;
  /** formal | informal */
  kind: string;
  /** up | down | not_configured | unknown — absent when cbp did not answer. */
  status?: string;
  statusMessage?: string;
}

export interface TransferTypeOption {
  value: string;
  /** Selecting this type requires at least one gateway for that direction. */
  gatewayBound: boolean;
}

export interface SymbolTypeCapability {
  symbolType: SymbolTypeEnum;
  depositTypes: TransferTypeOption[];
  withdrawTypes: TransferTypeOption[];
  defaultDepositTypes: string[];
  defaultWithdrawTypes: string[];
  /** cbp gateway categories a symbol of this type may draw from. */
  eligibleGatewayCategories: string[];
  /** Gateway codes eligible right now, from the live registry. */
  eligibleGateways: string[];
  defaultDepositGateways: string[];
  defaultWithdrawGateways: string[];
}

/**
 * Everything the admin symbol form needs, in one response: what each symbol
 * type allows and which gateways are actually registered in goldex-cbp. The
 * panel holds no copy of these rules.
 */
export interface SymbolCapabilities {
  symbolTypes: SymbolTypeCapability[];
  gateways: GatewayOption[];
  /**
   * False when goldex-cbp could not be reached. The form still works — it
   * falls back to whatever gateways the symbol already has — but it should
   * tell the admin the list may be incomplete.
   */
  gatewayRegistryAvailable: boolean;
  gatewayRegistryError?: string;
}
