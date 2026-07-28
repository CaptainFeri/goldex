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
}

export interface MarketOpportunity {
  type: MarketOpportunityType;
  deliveryType: string;
  direction: TrendDirection;
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
