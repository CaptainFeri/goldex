/**
 * Domain types for the price-monitoring / arbitrage feature.
 *
 * Messages from the monitored gold channel look like:
 *   "74,000,000 🔵خرید⏳با حواله 1 تا شنا"
 *   "توضیحات ❗️ : ۷۳۸۰۰ب ۷۴۰۰۰ تعویضی"
 *
 * The label side is from the *poster's* perspective and therefore inverts for
 * us (see ARBITRAGE semantics below).
 */

/** Raw label printed in the message. */
export type PriceSideLabel = 'خرید' | 'فروش';

/**
 * What the price means for *us* (the arbitrageur):
 *  - خرید (their buy)  → we can SELL at this price.
 *  - فروش (their sell) → we can BUY at this price.
 */
export type OurAction = 'WE_SELL' | 'WE_BUY';

/** Our-perspective labels for the chart/UI (the only meaning that matters). */
export const ACTION_LABELS: Record<OurAction, string> = {
  WE_BUY: 'خرید ما',
  WE_SELL: 'فروش ما',
};

/** Maps a raw message side to what it means for us. */
export function sideToAction(side: PriceSideLabel): OurAction {
  return side === 'خرید' ? 'WE_SELL' : 'WE_BUY';
}

/**
 * Market units: the announced price is per مثقال (mithqal) and the "تا"
 * quantity is in kilograms (1 تا = 1kg). Profit scales by the number of
 * mithqals traded, not the kilo count. Override the weight via MITHQAL_GRAMS.
 */
export const GRAMS_PER_MITHQAL = Number(process.env.MITHQAL_GRAMS) || 4.6083;
export const MITHQALS_PER_KILO = 1000 / GRAMS_PER_MITHQAL;

/** Sub-category, identified by a keyword in the message. */
export type PriceSubType = 'normal' | 'shena' | 'makus';

export const SUBTYPE_LABELS: Record<PriceSubType, string> = {
  normal: 'عادی',
  shena: 'شنا',
  makus: 'معکوس',
};

/**
 * The order button copied from a source message's inline keyboard. The
 * callback `data` is kept as the original utf-8 string (e.g. "grp|ord|574929|602|1")
 * so it can be re-issued to place the order; `text`/`url` cover URL buttons.
 */
export interface OrderButton {
  text: string;
  data?: string;
  url?: string;
}

export interface ParsedPrice {
  /** Numeric price in Toman (commas stripped). */
  price: number;
  /** Raw side label as printed. */
  sideLabel: PriceSideLabel;
  /** Inverted, our-perspective action. */
  ourAction: OurAction;
  /** Sub-category bucket. */
  subType: PriceSubType;
  /** Settlement / delivery descriptor, e.g. "با حواله", "روز", "نقد حاضر". */
  deliveryType: string;
  /** Quantity (number of "تا" units / inline buttons). */
  quantity: number;
  /** Optional توضیحات note shown under the price. */
  description?: string;
  /** Original message text, untouched. */
  raw: string;
}

/** Compact, persisted record used to drive the price chart. */
export interface PricePoint {
  /** Unix seconds (message date). */
  date: number;
  messageId: number;
  price: number;
  /** Raw side label: خرید (we sell) or فروش (we buy). */
  side: PriceSideLabel;
  /** Our-perspective action — the meaning that drives the chart. */
  ourAction: OurAction;
  subType: PriceSubType;
  deliveryType: string;
  quantity: number;
  description?: string;
}

/** Filters accepted by the chart API. */
export interface PriceQuery {
  subType?: PriceSubType;
  deliveryType?: string;
  /** Filter by our action (WE_BUY / WE_SELL). */
  action?: OurAction;
  /** Unix seconds, inclusive. */
  from?: number;
  to?: number;
  /** Keep only the most recent N points after filtering. */
  limit?: number;
}

/** A parsed price stamped with when it was seen. */
export interface PriceSnapshot extends ParsedPrice {
  /** Source message id. */
  messageId: number;
  /** Unix seconds (message date). */
  date: number;
  /** Category bucket key these were stored under. */
  categoryKey: string;
  /** Source chat id (e.g. "-1003944865897"), used to build message links. */
  chatId?: string;
  /** Order button copied from the source message, if any. */
  orderButton?: OrderButton;
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
