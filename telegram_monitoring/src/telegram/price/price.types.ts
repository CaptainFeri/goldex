export type PriceSideLabel = 'خرید' | 'فروش';

export type OurAction = 'WE_SELL' | 'WE_BUY';

export const ACTION_LABELS: Record<OurAction, string> = {
  WE_BUY: 'خرید ما',
  WE_SELL: 'فروش ما',
};

export function sideToAction(side: PriceSideLabel): OurAction {
  return side === 'خرید' ? 'WE_SELL' : 'WE_BUY';
}

export const GRAMS_PER_MITHQAL = Number(process.env.MITHQAL_GRAMS) || 4.3318;
export const MITHQALS_PER_KILO = 1000 / GRAMS_PER_MITHQAL;

export type PriceSubType = 'normal' | 'shena' | 'makus';

export const SUBTYPE_LABELS: Record<PriceSubType, string> = {
  normal: 'عادی',
  shena: 'شنا',
  makus: 'معکوس',
};

export interface OrderButton {
  text: string;
  data?: string;
  url?: string;
}

export interface ParsedPrice {
  price: number;
  sideLabel: PriceSideLabel;
  ourAction: OurAction;
  subType: PriceSubType;
  deliveryType: string;
  quantity: number;
  description?: string;
  raw: string;
}

export interface PricePoint {
  date: number;
  messageId: number;
  price: number;
  side: PriceSideLabel;
  ourAction: OurAction;
  subType: PriceSubType;
  deliveryType: string;
  quantity: number;
  description?: string;
}

export interface PriceQuery {
  subType?: PriceSubType;
  deliveryType?: string;
  action?: OurAction;
  from?: number;
  to?: number;
  limit?: number;
}

export interface PriceSnapshot extends ParsedPrice {
  messageId: number;
  date: number;
  categoryKey: string;
  chatId?: string;
  orderButton?: OrderButton;
}

export type MarketOpportunityType = 'PRICE_MOVEMENT' | 'BEST_PRICE';

export type TrendDirection = 'UP' | 'DOWN' | 'FLAT';

export interface MarketState {
  deliveryType: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastPrice: number;
  lastAction: OurAction;
  priceChange: number;
  priceChangePercent: number;
  direction: TrendDirection;
  volume: number;
  lastUpdate: number;
  /** Best bid/ask before the latest update (basis for best-price alerts). */
  prevBestBid?: number | null;
  prevBestAsk?: number | null;
}

export interface MarketOpportunity {
  type: MarketOpportunityType;
  deliveryType: string;
  direction: TrendDirection;
  /** Which side we act on: WE_SELL (خرید — our profit side) or WE_BUY (فروش — our cost side). */
  ourAction: OurAction;
  price: number;
  previousPrice: number;
  changePercent: number;
  messageId: number;
  date: number;
  chatId?: string;
  quantity: number;
  description?: string;
}

export interface OpportunityRecord {
  id: number;
  date: number;
  type: MarketOpportunityType;
  deliveryType: string;
  direction: TrendDirection;
  price: number;
  previousPrice: number;
  changePercent: number;
  messageId: number;
  quantity: number;
  description?: string;
}

export interface OpportunityQuery {
  type?: MarketOpportunityType;
  deliveryType?: string;
  from?: number;
  to?: number;
}

export interface OpportunitySummary {
  count: number;
  byType: {
    type: MarketOpportunityType;
    label: string;
    count: number;
  }[];
  byDeliveryType: {
    deliveryType: string;
    count: number;
  }[];
}

/** Side details for an arbitrage opportunity (buy or sell). */
export interface ArbitrageSideDetail {
  price: number;
  messageId: number;
  date: number;
  quantity: number;
  sideLabel: PriceSideLabel;
  ourAction: OurAction;
  description?: string;
  raw?: string;
  chatId?: string;
  orderButtonData?: string;
  orderButtonText?: string;
}

/** Compact, persisted record of an alerted arbitrage (for the profit report). */
export interface ArbitrageRecord {
  /** Unix seconds — the later of the two source messages. */
  date: number;
  subType: PriceSubType;
  deliveryType: string;
  buyAt: number;
  sellAt: number;
  spread: number;
  quantity: number;
  /** spread * quantity, in Toman. */
  totalProfit: number;
  /** Whether the buy order came before the sell order chronologically. */
  buyFirst: boolean;
  /** Verbose buy-side details. */
  buy: ArbitrageSideDetail;
  /** Verbose sell-side details. */
  sell: ArbitrageSideDetail;
}

/** Wallet state computed from all arbitrage records. */
export interface WalletState {
  /** Total gold bought (grams). */
  totalGoldBought: number;
  /** Total gold sold (grams). */
  totalGoldSold: number;
  /** Net gold position (grams). */
  netGold: number;
  /** Total cash spent on buys (Toman). */
  totalCashSpent: number;
  /** Total cash received from sells (Toman). */
  totalCashReceived: number;
  /** Net cash balance = received - spent (Toman). */
  netCash: number;
}

/** Date/category filters for the profit report. */
export interface ArbitrageQuery {
  subType?: PriceSubType;
  deliveryType?: string;
  /** Unix seconds, inclusive. */
  from?: number;
  to?: number;
}

/** Aggregated profit across the filtered arbitrages. */
export interface ArbitrageSummary {
  count: number;
  totalProfit: number;
  byCategory: {
    subType: PriceSubType;
    label: string;
    count: number;
    totalProfit: number;
  }[];
}

/** Result of an arbitrage check within one comparable bucket. */
export interface ArbitrageOpportunity {
  categoryKey: string;
  subType: PriceSubType;
  deliveryType: string;
  /** The فروش order we buy from (lowest فروش price). */
  buy: PriceSnapshot;
  /** The خرید order we sell to (highest خرید price). */
  sell: PriceSnapshot;
  /** sell.price - buy.price; per-unit profit (positive). */
  spread: number;
  /** Executable size = min(buy.quantity, sell.quantity). */
  quantity: number;
  /** spread * quantity. */
  totalProfit: number;
}
