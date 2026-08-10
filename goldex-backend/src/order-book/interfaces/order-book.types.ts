import { Side } from "nodejs-order-book";

export enum OrderSource {
  CUSTOMER = "CUSTOMER",
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
