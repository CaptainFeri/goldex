import { randomUUID } from 'crypto';
import { config } from './config';
import { Quote } from './catalog';

// The TalaAb provider treats item ids 25 & 28 as silver and does NOT multiply
// their prices by 1000. Every other item is sent pre-divided by 1000 so the
// engine's ×1000 restores the real toman value.
const NON_SCALED_IDS = new Set([25, 28]);

function priceStr(itemId: number, value: number): string {
  return NON_SCALED_IDS.has(itemId) ? String(value) : String(value / 1000);
}

/** `GET <apiBaseUrl>` (homepage) — metadata + shop open/closed status. */
export function buildHomepage(quotes: Quote[]) {
  const molten: { id: number; title: string }[] = [];
  const coin: { id: number; title: string }[] = [];
  const silver: { id: number; title: string }[] = [];
  for (const q of quotes) {
    const entry = { id: q.item.id, title: q.item.name };
    if (q.item.group === 'coin') coin.push(entry);
    else if (q.item.group === 'silver') silver.push(entry);
    else molten.push(entry);
  }
  return {
    data: {
      features_data: { molten, coin, silver },
      sell_status: config.shopOpen ? 1 : 0,
      buy_status: config.shopOpen ? 1 : 0,
    },
  };
}

export function buildConnectionEstablished(): string {
  return JSON.stringify({
    event: 'pusher:connection_established',
    data: JSON.stringify({ socket_id: randomUUID(), activity_timeout: 30 }),
  });
}

export function buildPong(): string {
  return JSON.stringify({ event: 'pusher:pong', data: {} });
}

/** Pusher `new-panel` frame carrying an `all_systems_pricing_updated` payload. */
export function buildPricingPush(quotes: Quote[]): string {
  const currencies = quotes.map((q) => ({
    id: q.item.id,
    buy_price: priceStr(q.item.id, q.buy),
    sell_price: priceStr(q.item.id, q.sell),
    buy_status: q.canBuy ? 1 : 0,
    sell_status: q.canSell ? 1 : 0,
  }));
  return JSON.stringify({
    event: 'new-panel',
    data: JSON.stringify({
      message: {
        type: 'all_systems_pricing_updated',
        data: { pricing: [{ currencies }] },
      },
    }),
  });
}

export function buildVerifyOtp(shop: string) {
  return {
    success: true,
    message: 'OK',
    data: { token: `mock-token-${shop}` },
  };
}

export function buildSendOtp() {
  return { success: true, message: 'OTP sent' };
}

/** `POST /profile/trades/molten` — accepts a trade; resolution is decided later. */
export function buildTrade(requestId: number, count: number, price: number, dealType: number) {
  return {
    success: true,
    message: 'OK',
    data: {
      request_id: requestId,
      type_text: dealType === 0 ? 'فروش' : 'خرید',
      gold_type_title: 'طلای آب‌شده',
      mazaneh: price,
      value: count,
      price: price * count,
      status: 0, // pending; final status surfaces via application-latest-trades
    },
  };
}

/**
 * `GET /profile/application-latest-trades` — the engine polls this and matches
 * `sanad` to read `status` (1 = confirmed, 2 = rejected).
 */
export function buildLatestTrades(orders: { id: string; status: number }[]) {
  return {
    success: true,
    message: 'OK',
    data: orders.map((o) => ({
      sanad: o.id,
      status: o.status,
      status_text: o.status === 1 ? 'تایید شده' : o.status === 2 ? 'رد شده' : 'در انتظار',
      status_string: o.status === 1 ? 'confirmed' : o.status === 2 ? 'rejected' : 'pending',
    })),
  };
}
