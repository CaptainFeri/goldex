import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logger/structured-logger';
import {
  ArbitrageOpportunity,
  MITHQALS_PER_KILO,
  OrderButton,
  ParsedPrice,
  PriceSnapshot,
} from './price.types';

/** Max snapshots kept per category bucket (in-memory ring). */
const MAX_PER_CATEGORY = 1000;
/** Only compare prices seen within this window (seconds) for arbitrage. */
const ARBITRAGE_WINDOW_SECONDS = 120;
/** Default minimum per-unit profit (spread) to alert on. */
const DEFAULT_MIN_PROFIT = 80_000;

/**
 * In-memory store of parsed price snapshots, grouped by category, plus a
 * first-pass arbitrage detector.
 *
 * Categorization: prices are bucketed by sub-type (normal / shena / makus) —
 * the شنا و معکوس sub-categories the user asked for. Arbitrage is evaluated on
 * a finer key (sub-type + delivery type) so we only compare like-for-like
 * settlement terms.
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new StructuredLogger(PriceHistoryService.name);

  /** Only opportunities with a per-unit spread above this are reported. */
  private readonly minProfit =
    Number(process.env.ARBITRAGE_MIN_PROFIT) || DEFAULT_MIN_PROFIT;

  /** categoryKey (sub-type) -> snapshots, oldest first. */
  private readonly history = new Map<string, PriceSnapshot[]>();

  /** arbitrageKey -> "buyAt|sellAt" of the last opportunity reported. */
  private readonly lastReported = new Map<string, string>();

  /** The sub-type is the primary "category" for history & display. */
  categoryKeyFor(parsed: ParsedPrice): string {
    return parsed.subType;
  }

  /** Finer bucket used only for arbitrage comparison. */
  private arbitrageKeyFor(parsed: ParsedPrice): string {
    return `${parsed.subType}::${parsed.deliveryType}`;
  }

  record(
    parsed: ParsedPrice,
    messageId: number,
    date: number,
    orderButton?: OrderButton,
    chatId?: string,
  ): PriceSnapshot {
    const categoryKey = this.categoryKeyFor(parsed);
    const snapshot: PriceSnapshot = {
      ...parsed,
      messageId,
      date,
      categoryKey,
      chatId,
      orderButton,
    };

    const bucket = this.history.get(categoryKey) ?? [];
    bucket.push(snapshot);
    if (bucket.length > MAX_PER_CATEGORY) bucket.shift();
    this.history.set(categoryKey, bucket);

    return snapshot;
  }

  getHistory(categoryKey: string): readonly PriceSnapshot[] {
    return this.history.get(categoryKey) ?? [];
  }

  /**
   * Recent snapshots for one arbitrage bucket (sub-type + delivery type),
   * oldest first — used to render the chart image attached to an alert.
   */
  getBucketHistory(
    subType: string,
    deliveryType: string,
    limit = 80,
  ): readonly PriceSnapshot[] {
    const bucket = (this.history.get(subType) ?? []).filter(
      (s) => s.deliveryType === deliveryType,
    );
    return bucket.slice(-limit);
  }

  /**
   * Looks for an arbitrage opportunity in the same sub-type + delivery bucket
   * as `parsed`, within the recent time window.
   *
   * Semantics: خرید = a price we can SELL at, فروش = a price we can BUY at.
   * Profit exists when the highest خرید (our sell) exceeds the lowest فروش
   * (our buy) for the same product.
   */
  detectArbitrage(
    parsed: ParsedPrice,
    asOf: number,
  ): ArbitrageOpportunity | null {
    // Only detect arbitrage on normal (عادی) opportunities — exclude معکوس and شنا.
    if (parsed.subType !== 'normal') return null;

    const arbKey = this.arbitrageKeyFor(parsed);
    const since = asOf - ARBITRAGE_WINDOW_SECONDS;

    const recent = this.getHistory(this.categoryKeyFor(parsed)).filter(
      (s) => `${s.subType}::${s.deliveryType}` === arbKey && s.date >= since,
    );

    let bestSell: PriceSnapshot | undefined; // highest خرید (we sell)
    let bestBuy: PriceSnapshot | undefined; // lowest فروش (we buy)

    for (const s of recent) {
      if (s.description) continue;
      if (s.ourAction === 'WE_SELL') {
        if (!bestSell || s.price > bestSell.price) bestSell = s;
      } else {
        if (!bestBuy || s.price < bestBuy.price) bestBuy = s;
      }
    }

    if (!bestSell || !bestBuy) return null;

    const spread = bestSell.price - bestBuy.price;
    // Only alert on a meaningful margin (default > 80,000 per unit).
    if (spread <= this.minProfit) return null;

    const quantity = Math.min(bestBuy.quantity, bestSell.quantity);
    // Price is per mesqal, quantity is in kg. Convert mesqal → gram → kg profit.
    const totalProfit = Math.round(spread * MITHQALS_PER_KILO * quantity);
    const opportunity: ArbitrageOpportunity = {
      categoryKey: this.categoryKeyFor(parsed),
      subType: parsed.subType,
      deliveryType: parsed.deliveryType,
      buy: bestBuy,
      sell: bestSell,
      spread,
      quantity,
      totalProfit,
    };

    this.logger.logStructured('ARBITRAGE_OPPORTUNITY', {
      categoryKey: opportunity.categoryKey,
      deliveryType: opportunity.deliveryType,
      buyAt: bestBuy.price,
      buyFromMessageId: bestBuy.messageId,
      sellAt: bestSell.price,
      sellToMessageId: bestSell.messageId,
      spread,
      quantity,
      totalProfit: opportunity.totalProfit,
    });

    return opportunity;
  }

  /**
   * Returns true the first time a given (buyAt, sellAt) pair is seen for a
   * bucket, and remembers it so repeated detections of the *same* spread don't
   * spam the target channel. A changed price pair reports again.
   */
  markReportedIfNew(opportunity: ArbitrageOpportunity): boolean {
    const key = `${opportunity.subType}::${opportunity.deliveryType}`;
    const signature = `${opportunity.buy.price}|${opportunity.sell.price}`;
    if (this.lastReported.get(key) === signature) return false;
    this.lastReported.set(key, signature);
    return true;
  }
}
