export enum MessagePatterns {
  PRICE_UPDATE = 'price.update',
  PRICE_SNAPSHOT = 'price.snapshot',
  PROVIDER_CREATED = 'provider.created',
  PROVIDER_UPDATED = 'provider.updated',
  PROVIDER_ACTIVATED = 'provider.activated',
  PROVIDER_DEACTIVATED = 'provider.deactivated',
  PROVIDER_OTP_SENT = 'provider.otp.sent',
  PROVIDER_OTP_VERIFIED = 'provider.otp.verified',
  PROVIDER_CONNECTED = 'provider.connected',
  PROVIDER_DISCONNECTED = 'provider.disconnected',
  PROVIDER_STATUS_CHANGED = 'provider.status.changed',
  PRICE_PAIR_UPDATE = 'price.pair.update',
  ORDER_PLACE_REQUEST = 'provider.order.place.request',
  ORDER_PLACED = 'provider.order.placed',
  ORDER_STATUS_CHANGED = 'provider.order.status.changed',
  PROVIDER_BALANCE_UPDATED = 'provider.balance.updated',
  PROVIDER_DEALS_UPDATED = 'provider.deals.updated',
}

export interface RabbitMQMessage {
  pattern: string;
  data: any;
  timestamp: string;
  providerKey?: string;
}

export interface PriceData {
  itemId: number;
  buyPrice: number;
  sellPrice: number;
  buyPriceStr: string;
  sellPriceStr: string;
  canBuy: boolean;
  canSell: boolean;
  buyRange: number;
  sellRange: number;
  maxBuyCount: number;
  maxSellCount: number;
  spread: number;
  spreadPercent: number;
  updatedTimeStr: string;
  timestamp: string;
  itemName: string;
  unit: string;
  groupId: number;
  groupName: string;
  providerKey: string;
  buyPricePerGram?: number;
  sellPricePerGram?: number;
  buyPricePerGramStr?: string;
  sellPricePerGramStr?: string;
}

export const RABBITMQ_CLIENT = 'RABBITMQ_CLIENT';

export interface PricePairUpdateMessage {
  pairId: string;
  pairKey: string;
  bestBuyPrice: number;
  bestSellPrice: number;
  bestBuyProvider: string | null;
  bestSellProvider: string | null;
  buyCommission: number;
  sellCommission: number;
  baseGain: number;
  baseGainType: string;
  displayBuyPrice: number;
  displaySellPrice: number;
  bestBuyGramPrice: number;
  bestSellGramPrice: number;
  displayBuyGramPrice: number;
  displaySellGramPrice: number;
  minBuy: number;
  maxBuy: number;
  minSell: number;
  maxSell: number;
  decimals: number;
  marketType: string;
  lastUpdated: string;
}

export interface PriceSnapshotMessage {
  providerKey: string;
  items: Array<{
    itemId: number;
    name: string;
    unit: string;
    buyPrice: number;
    sellPrice: number;
  }>;
  timestamp: string;
}
