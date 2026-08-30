export const RABBITMQ_EXCHANGE = 'signalr.providers';

export const RABBITMQ_EXCHANGE_TYPE = 'topic';

export const RABBITMQ_QUEUE = 'signalr.providers.queue';

/**
 * Dedicated queue for backend -> engine provider-management commands. Kept
 * separate from the price/status stream queue so commands are never mixed with
 * (or intercepted by) the streaming consumers.
 */
export const RABBITMQ_COMMAND_QUEUE = 'signalr.providers.commands';

export const MessagePatterns = {
  PRICE_UPDATE: 'price.update',
  PRICE_HISTORY: 'price.history',
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
  PROVIDER_DEALS_UPDATED: 'provider.deals.updated',
  PROVIDER_BALANCE_UPDATED: 'provider.balance.updated',
  ORDER_PLACE_REQUEST: 'provider.order.place.request',
  ORDER_PLACED: 'provider.order.placed',
  ORDER_STATUS_CHANGED: 'provider.order.status.changed',
  ARBITRAGE_SCAN: 'arbitrage.scan',
  ARBITRAGE_SIGNAL: 'arbitrage.signal',

  // Backend -> engine provider-management commands (consumed on the command queue)
  PROVIDER_COMMAND_CREATE: 'provider.command.create',
  PROVIDER_COMMAND_UPDATE: 'provider.command.update',
  PROVIDER_COMMAND_TOGGLE_ACTIVE: 'provider.command.toggle-active',
  PROVIDER_COMMAND_SEND_OTP: 'provider.command.send-otp',
  PROVIDER_COMMAND_VERIFY_OTP: 'provider.command.verify-otp',
  PROVIDER_COMMAND_RECONCILE: 'provider.command.reconcile',
  PROVIDER_COMMAND_REFRESH: 'provider.command.refresh',
  PROVIDER_COMMAND_FETCH_ORDERS: 'provider.command.fetch-orders',
  PROVIDER_COMMAND_FETCH_BALANCE: 'provider.command.fetch-balance',
  PROVIDER_COMMAND_PLACE_ORDER: 'provider.command.place-order',
} as const;

export type MessagePattern = (typeof MessagePatterns)[keyof typeof MessagePatterns];

export function getRoutingKey(pattern: MessagePattern, providerKey?: string): string {
  const parts = pattern.split('.');
  if (providerKey) {
    parts.splice(1, 0, providerKey);
  }
  return parts.join('.');
}

export function getPatternFromRoutingKey(routingKey: string): string {
  const parts = routingKey.split('.');
  const isProviderScoped = parts.length >= 3;
  if (isProviderScoped && parts[2]) {
    return `${parts[0]}.${parts[2]}`;
  }
  return parts.slice(0, 2).join('.');
}
