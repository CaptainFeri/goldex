import { Side } from "nodejs-order-book";

export enum OrderSource {
  PROVIDER = "PROVIDER",
  CUSTOMER = "CUSTOMER",
}

export interface ProviderOrderInfo {
  pairId: string;
  side: Side;
  price: number;
  index: number;
}

export interface CustomerOrderInfo {
  orderId: string;
  userId: string;
  pairId: string;
}

export interface MatchedOrder {
  makerOrderId: string;
  makerSide: Side;
  makerPrice: number;
  makerSource: OrderSource;
  size: number;
  takerPrice: number;
  profit: number;
}

export interface ProcessedTrade {
  makerOrderId: string;
  makerSide: Side;
  makerPrice: number;
  makerSource: OrderSource;
  takerOrderId: string;
  takerSide: Side;
  takerPrice: number;
  size: number;
}

export interface DepthLevel {
  price: number;
  size: number;
  orderCount: number;
  source: OrderSource;
}

export interface OrderBookDepth {
  pairId: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}
