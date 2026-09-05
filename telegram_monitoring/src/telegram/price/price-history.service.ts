import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logger/structured-logger';
import {
  ArbitrageOpportunity,
  MITHQALS_PER_KILO,
  OrderButton,
  ParsedPrice,
  PriceSnapshot,
  TRADE_FEE_PER_MITHQAL,
} from './price.types';

/** Max snapshots kept per category bucket (in-memory ring). */
const MAX_PER_CATEGORY = 1000;
/** Only compare prices seen within this window (seconds) for arbitrage. */
const DEFAULT_ARBITRAGE_WINDOW_SECONDS = 600;
/** Default minimum per-unit profit (spread) to alert on. */
const DEFAULT_MIN_PROFIT = 80_000;
/**
 * The two legs of an arbitrage pair must be observed this close together
 * (seconds). A leg that is older may have moved — pairing with it books
 * profit that is not trustworthy.
 */
const DEFAULT_MAX_LEG_AGE_SECONDS = 60;

/**
 * A reported (buyAt, sellAt) pair is remembered for this long before the
 * same pair may alert again — matches the detection window by default.
 */
const DEFAULT_REPORT_TTL_SECONDS = 600;

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

  /** How far back (seconds) prices may be compared for arbitrage. */
  private readonly windowSeconds =
    Number(process.env.ARBITRAGE_WINDOW_SECONDS) ||
    DEFAULT_ARBITRAGE_WINDOW_SECONDS;

  /** How long a reported pair is remembered (seconds) before it can re-alert. */
  private readonly reportTtlSeconds =
    Number(process.env.ARBITRAGE_REPORT_TTL_SECONDS) ||
    this.windowSeconds;

  /** Max age (seconds) of the opposite leg paired with the current message. */
  private readonly maxLegAgeSeconds =
    Number(process.env.ARBITRAGE_MAX_LEG_AGE_SECONDS) ||
    DEFAULT_MAX_LEG_AGE_SECONDS;

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
   * as `parsed`, pairing the current message with the best opposite-side
   * price seen recently.
   *
   * Time-distance rule: the two legs must have been observed within
   * maxLegAgeSeconds of each other — an older leg has already moved, so its
   * price (and any profit) is not trustworthy. The current message is always
   * one leg (it just arrived); the opposite leg is chosen from the past
   * window. This rejects stale pairs like a فروش from 13:34 paired with a
   * خرید from 13:39.
   *
   * Semantics: خرید = a price we can SELL at, فروش = a price we can BUY at.
   * Profit exists when the highest خرید (our sell) exceeds the lowest فروش
   * (our buy) for the same product. Profit is reported net of the exchange
   * fee on both legs (10k IRR per mesqal each), and the spread must exceed
   * the fees or the round trip is a guaranteed loss.
   */
  detectArbitrage(snapshot: PriceSnapshot): ArbitrageOpportunity | null {
    // Only detect arbitrage on normal (عادی) opportunities — exclude معکوس and شنا.
    if (snapshot.subType !== 'normal') return null;
    // Special/custom orders (description) are not tradable prices.
    if (snapshot.description) return null;

    const asOf = snapshot.date;
    const arbKey = this.arbitrageKeyFor(snapshot);
    const since = asOf - this.maxLegAgeSeconds;

    // The opposite side observed within the freshness window. If the current
    // message is a خرید (we sell), find the lowest فروش (we buy); if it is a
    // فروش (we buy), find the highest خرید (we sell).
    let opposite: PriceSnapshot | undefined;
    let oppositeCount = 0;
    for (const s of this.getHistory(this.categoryKeyFor(snapshot))) {
      if (`${s.subType}::${s.deliveryType}` !== arbKey) continue;
      if (s.description) continue;
      if (s.date < since || s.date > asOf) continue;
      if (s.ourAction === snapshot.ourAction) continue;
      oppositeCount++;
      if (!opposite) {
        opposite = s;
        continue;
      }
      if (s.ourAction === 'WE_SELL') {
        if (s.price > opposite.price) opposite = s;
      } else if (s.price < opposite.price) {
        opposite = s;
      }
    }

    if (!opposite) {
      this.logger.logStructured('ARBITRAGE_SKIP', {
        reason: 'missing-opposite-leg',
        bucket: arbKey,
        since,
        oppositeCount,
        subType: snapshot.subType,
        deliveryType: snapshot.deliveryType,
      });
      return null;
    }

    const bestBuy =
      snapshot.ourAction === 'WE_BUY' ? snapshot : (opposite as PriceSnapshot);
    const bestSell =
      snapshot.ourAction === 'WE_SELL' ? snapshot : (opposite as PriceSnapshot);

    const spread = bestSell.price - bestBuy.price;
    // Two legs each pay the fee per mesqal — anything at or below that is a
    // guaranteed loss, whatever ARBITRAGE_MIN_PROFIT is set to.
    const feeFloor = 2 * TRADE_FEE_PER_MITHQAL;
    // Only alert on a meaningful margin (default > 80,000 per unit).
    if (spread <= Math.max(this.minProfit, feeFloor)) {
      this.logger.logStructured('ARBITRAGE_SKIP', {
        reason: 'below-threshold',
        bucket: arbKey,
        oppositeCount,
        legTimeGap: Math.abs(bestBuy.date - bestSell.date),
        bestBuy: bestBuy.price,
        bestSell: bestSell.price,
        spread,
        feeFloor,
        minProfit: this.minProfit,
      });
      return null;
    }

    const quantity = Math.min(bestBuy.quantity, bestSell.quantity);
    // Price is per mesqal, quantity is in kg. Net profit after the fee on both
    // legs: (spread − 2 × fee per mesqal) × mesqal-per-kg × quantity.
    const totalProfit = Math.round(
      (spread - feeFloor) * MITHQALS_PER_KILO * quantity,
    );
    const opportunity: ArbitrageOpportunity = {
      categoryKey: this.categoryKeyFor(snapshot),
      subType: snapshot.subType,
      deliveryType: snapshot.deliveryType,
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
      buyMessageId: bestBuy.messageId,
      buyDate: bestBuy.date,
      sellAt: bestSell.price,
      sellMessageId: bestSell.messageId,
      sellDate: bestSell.date,
      legTimeGap: Math.abs(bestBuy.date - bestSell.date),
      spread,
      feeFloor,
      quantity,
      totalProfit: opportunity.totalProfit,
    });

    return opportunity;
  }

  /**
   * Returns true the first time a given (buyAt, sellAt) pair is seen for a
   * bucket, and remembers it so repeated detections of the *same* spread don't
   * spam the target channel. A changed price pair reports again, and a pair
   * older than the report TTL may report again (market returned to it).
   */
  markReportedIfNew(opportunity: ArbitrageOpportunity): boolean {
    const key = `${opportunity.subType}::${opportunity.deliveryType}`;
    const signature = `${opportunity.buy.price}|${opportunity.sell.price}`;
    const last = this.lastReported.get(key);
    if (last) {
      const [seenSignature, seenAt] = last.split('@');
      if (seenSignature === signature && Date.now() - Number(seenAt) < this.reportTtlSeconds * 1000) {
        return false;
      }
    }
    this.lastReported.set(key, `${signature}@${Date.now()}`);
    return true;
  }
}
