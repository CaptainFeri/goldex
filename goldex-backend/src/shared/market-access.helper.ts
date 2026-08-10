import { MarketKindEnum } from "../admin-pair/enum/market.kind.enum";
import { MarketTypeEnum } from "../admin-pair/enum/market.type.enum";
import { UserRoleEnum } from "./enum/user.role.enum";

// Role-based defaults used when a user has no explicit market access rows.
//  - CUSTOMER: market + limit trading, official (formal) pairs by default.
//  - PARTNER:  market + limit + offer (Telegram) trading, both pair kinds.
export function defaultMarketKindsForRole(role: number): MarketKindEnum[] {
  if (role === UserRoleEnum.PARTNER) {
    return [MarketKindEnum.MARKET, MarketKindEnum.LIMIT, MarketKindEnum.OFFER];
  }
  return [MarketKindEnum.MARKET, MarketKindEnum.LIMIT];
}

export function defaultMarketTypesForRole(role: number): MarketTypeEnum[] {
  if (role === UserRoleEnum.PARTNER) {
    return [MarketTypeEnum.FORMAL, MarketTypeEnum.INFORMAL];
  }
  return [MarketTypeEnum.FORMAL];
}
