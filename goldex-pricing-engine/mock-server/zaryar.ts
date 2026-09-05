import { randomUUID } from 'crypto';
import { config } from './config';
import { Quote } from './catalog';

function toman(n: number): string {
  return n.toLocaleString('en-US') + ' تومان';
}

function timeStr(): string {
  return new Date().toLocaleTimeString('en-GB');
}

// Shared price/flag fields, common to both payloads.
function priceFields(q: Quote) {
  return {
    Name: q.item.name,
    FeeBuy: q.buy,
    FeeSell: q.sell,
    FeeBuyStr: toman(q.buy),
    FeeSellStr: toman(q.sell),
    BuyCanDeal: q.canBuy,
    SellCanDeal: q.canSell,
    BuyRange: 5,
    SellRange: 5,
    MaxBuyCount: 100,
    MaxSellCount: 100,
    UpdatedTimeStr: timeStr(),
    IBuy: false,
    ISell: false,
    IsShow: true,
  };
}

// REST `ShopkeeperItemsList` items are keyed by `Id`.
function mapRestItem(q: Quote) {
  return { Id: q.item.id, ...priceFields(q) };
}

// Live `update_mazane` WebSocket items are keyed by `ItemId` (engine filters on it).
function mapMazaneItem(q: Quote) {
  return { ItemId: q.item.id, ...priceFields(q) };
}

/** `POST /api/Home/ShopkeeperItemsList` — grouped catalog with current prices. */
export function buildItemsList(quotes: Quote[]) {
  const byGroup = new Map<string, Quote[]>();
  for (const q of quotes) {
    const list = byGroup.get(q.item.groupName) ?? [];
    list.push(q);
    byGroup.set(q.item.groupName, list);
  }
  const Data = [...byGroup.entries()].map(([GroupName, list]) => ({
    GroupName,
    GroupId: list[0].item.group === 'coin' ? 2 : list[0].item.group === 'silver' ? 3 : 1,
    Items: list.map(mapRestItem),
  }));
  return { Data };
}

/** SignalR push frame the engine parses as a live `update_mazane` event. */
export function buildMazanePush(quotes: Quote[]) {
  return {
    C: `d-${randomUUID()}`,
    M: [
      {
        H: 'signalRPushHub',
        M: 'SendMessage',
        A: [
          {
            data: {
              alert_type: 'update_mazane',
              payload: { Items: quotes.map(mapMazaneItem) },
            },
          },
        ],
      },
    ],
  };
}

export function buildNegotiate() {
  return {
    ConnectionToken: randomUUID(),
    ConnectionId: randomUUID(),
    Url: '/signalr',
    ProtocolVersion: '2.1',
    KeepAliveTimeout: 20,
    DisconnectTimeout: 30,
    TryWebSockets: true,
  };
}

export function buildStart() {
  return { Response: 'started' };
}

export function buildProfile(shop: string) {
  return {
    Data: {
      Shopkeeper: {
        Id: shop,
        Name: `Mock ${shop}`,
        IsOnline: config.shopOpen,
      },
    },
  };
}

export function buildDealView(itemId: number, quotes: Quote[]) {
  const q = quotes.find((x) => x.item.id === itemId);
  return {
    IsSuccess: true,
    Message: 'OK',
    Data: {
      Id: itemId,
      Name: q?.item.name ?? `Item ${itemId}`,
      Price: q?.sell ?? 0,
      DiscountPrice: q?.buy ?? 0,
      MinCount: 1,
      MaxCount: 100,
      WaitTime: 30,
      CanDoDeal: config.shopOpen,
    },
  };
}

/** `POST /api/Home/SubmitDeal` — accepts an order; resolution is decided later. */
export function buildSubmitDeal(orderId: string) {
  return {
    IsSuccess: true,
    Message: 'OK',
    Data: {
      Id: orderId,
      OrderStatus: 0,
      OrderStatusStr: 'در انتظار', // pending
    },
  };
}

/**
 * `POST /api/Deal/DealsList` — the engine polls this and reads each item's
 * `OrderId` + `DealStatus` (1 = done, 2 = cancelled) to detect resolution.
 */
export function buildDealsList(orders: { id: string; status: number }[]) {
  return {
    IsSuccess: true,
    Message: null,
    Messages: null,
    Data: orders.map((o) => ({
      OrderId: o.id,
      DealStatus: o.status,
      OrderStatusStr: o.status === 1 ? 'انجام شده' : o.status === 2 ? 'لغو شده' : 'در انتظار',
    })),
  };
}

export function buildVerifyOtp(shop: string) {
  return {
    IsSuccess: true,
    Message: 'OK',
    Data: {
      user: {
        token: `mock-token-${shop}`,
        uId: `uid-${shop}`,
        userId: `userid-${shop}`,
        roleType: '0',
        sessionId: randomUUID(),
        shopkeeperId: shop,
      },
    },
  };
}

/** SignalR keep-alive / init frame (engine ignores `{}` and empty frames). */
export const ZARYAR_INIT_FRAME = JSON.stringify({ C: `d-${randomUUID()}`, S: 1, M: [] });
