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

  // Telegram monitoring
  TELEGRAM_PRICE = 'telegram.price',
  TELEGRAM_OPPORTUNITY = 'telegram.opportunity',
  TELEGRAM_MARKET_SNAPSHOT = 'telegram.market.snapshot',

  // Payments (goldex-cbp)
  PAYMENT_REQUEST_DEPOSIT = 'payment.request.deposit',
  PAYMENT_REQUEST_WITHDRAW = 'payment.request.withdraw',
  PAYMENT_REQUEST_WITHDRAW_APPROVE = 'payment.request.withdraw.approve',
  SYMBOL_SYNC = 'symbol.sync',
  PAYMENT_PROCESSING = 'payment.processing',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REJECTED = 'payment.rejected',
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

/**
 * Command sent to goldex-cbp when a deposit/withdraw is created in the
 * backend. `externalReference` is the backend deposit/withdraw entity id.
 */
export interface PaymentRequestMessage {
  externalReference: string;
  userId: string;
  symbolSlug: string;
  symbolType: string;
  type: string;
  amount: number | string;
  currency?: string;
  gatewayCode?: string;
  picturePath?: string;
  notes?: string;
  metadata?: Record<string, any>;
  // withdraw only
  beneficiaryIban?: string;
  beneficiaryName?: string;
  beneficiaryId?: string;
}

/** Sent to goldex-cbp when an admin approves a gateway-bound withdrawal. */
export interface WithdrawApproveMessage {
  externalReference: string;
  adminId: string;
}

/** Symbol config synced to goldex-cbp after admin edits. */
export interface SymbolSyncMessage {
  slug: string;
  name: string;
  symbolType: string;
  hasPaymentGateway: boolean;
  isActive: boolean;
  depositTypes: string[];
  withdrawTypes: string[];
  depositGateways: string[];
  withdrawGateways: string[];
  defaultDepositGateway?: string;
  defaultWithdrawGateway?: string;
}

/** Lifecycle event published by goldex-cbp back to the backend. */
export interface PaymentEventMessage {
  paymentId: string;
  externalReference: string;
  userId: string;
  operation: 'deposit' | 'withdraw';
  status: string;
  amount: number | string;
  currency?: string;
  gatewayCode?: string;
  identifier?: string;
  ipgReference?: string;
  gatewayUrl?: string;
  error?: string;
}
