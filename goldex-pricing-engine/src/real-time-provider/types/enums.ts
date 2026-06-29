export enum ProviderCategory {
  ZARYAR = 'zaryar',
  TALAAB = 'talaab',
}

export enum ItemGroupId {
  MOLTEN = 1,
  COIN = 2,
  SILVER = 3,
}

export enum ItemUnit {
  GRAM = 'گرم',
  COUNT = 'عدد',
}

export enum ProviderConnectionStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export enum DealType {
  BUY = 1,
  SELL = 2,
}

export const PROVIDER_EVENTS = {
  PRICE_UPDATE: 'price.update',
  PROVIDER_CREATED: 'provider.created',
  PROVIDER_UPDATED: 'provider.updated',
  PROVIDER_ACTIVATED: 'provider.activated',
  PROVIDER_DEACTIVATED: 'provider.deactivated',
  PROVIDER_OTP_SENT: 'provider.otp.sent',
  PROVIDER_OTP_VERIFIED: 'provider.otp.verified',
  PROVIDER_CONNECTED: 'provider.connected',
  PROVIDER_DISCONNECTED: 'provider.disconnected',
  PROVIDER_STATUS_CHANGED: 'provider.status.changed',
  PROVIDER_ERROR: 'provider.error',
  PRICE_SNAPSHOT: 'price.snapshot',
  MARKET_MAP_UPDATE: 'market.map.update',
  BEST_PRICES_UPDATE: 'market.bestprices.update',
} as const;

export type ProviderEvent = (typeof PROVIDER_EVENTS)[keyof typeof PROVIDER_EVENTS];
