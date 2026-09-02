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

/** Live state of one pair's shared (P2P) Limit Market book. */
export interface OrderBookStatus {
  pairId: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  pairLabel: string;
  /** The pair is tradable at all. Invalid pairs get no book. */
  isValid: boolean;
  /** An in-memory book exists for this pair. */
  hasBook: boolean;
  bidLevels: number;
  askLevels: number;
  /** Orders resting in the in-memory book. */
  restingOrders: number;
  /** PENDING / PARTIALLY_COMPLETED LIMIT orders in the database. */
  dbPendingOrders: number;
  /**
   * The in-memory book and the database agree on how many orders are resting.
   * A mismatch means the boot-time restore missed orders — the book is not
   * reflecting real customer intent.
   */
  inSync: boolean;
  totalBidSize: number;
  totalAskSize: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  spreadPercent: number | null;
  /** best bid >= best ask — orders that should have matched are sitting there. */
  crossed: boolean;
}
