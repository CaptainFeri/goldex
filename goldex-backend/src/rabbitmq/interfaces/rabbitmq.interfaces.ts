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
  PAYMENT_CALLBACK = 'payment.callback',
  PAYMENT_PROCESSING = 'payment.processing',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REJECTED = 'payment.rejected',

  // CBP admin RPC (request -> cbp, cbp replies on the response pattern)
  CBP_ADMIN_REQUEST = 'cbp.admin.request',
  CBP_ADMIN_RESPONSE = 'cbp.admin.response',

  // Backend -> pricing-engine provider management commands (command queue)
  PROVIDER_COMMAND_CREATE = 'provider.command.create',
  PROVIDER_COMMAND_UPDATE = 'provider.command.update',
  PROVIDER_COMMAND_TOGGLE_ACTIVE = 'provider.command.toggle-active',
  PROVIDER_COMMAND_SEND_OTP = 'provider.command.send-otp',
  PROVIDER_COMMAND_VERIFY_OTP = 'provider.command.verify-otp',
  PROVIDER_COMMAND_RECONCILE = 'provider.command.reconcile',
  PROVIDER_COMMAND_REFRESH = 'provider.command.refresh',
  PROVIDER_COMMAND_FETCH_ORDERS = 'provider.command.fetch-orders',
  PROVIDER_COMMAND_FETCH_BALANCE = 'provider.command.fetch-balance',
  PROVIDER_COMMAND_PLACE_ORDER = 'provider.command.place-order',

  // Arbitrage (published by the pricing-engine)
  ARBITRAGE_SCAN = 'arbitrage.scan',
  ARBITRAGE_SIGNAL = 'arbitrage.signal',
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

/**
 * Queue bound on the pricing-engine side for backend -> engine provider
 * management commands. Kept separate from the shared price/status stream and
 * from the engine's order-consumer queue to avoid interception.
 */
export const RABBITMQ_COMMAND_QUEUE = 'signalr.providers.commands';

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
