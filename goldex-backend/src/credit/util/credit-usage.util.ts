import Decimal from "decimal.js";
import { MESQAL_TO_GRAM } from "../../common/constants";

/**
 * The fields of a credit trade this calculation needs. Deliberately structural
 * rather than the entities, so it can be unit-tested and called from either the
 * repository or an `EntityManager` without dragging TypeORM in.
 */
export interface CreditUsageRow {
  /** CreditOrderEntity.status — CASHED_OUT trades have left the facility. */
  status?: string | null;
  /** CreditOrderEntity.priceAtOrderTime, the fallback price. */
  priceAtOrderTime?: number | string | null;
  order?: {
    status?: string | null;
    side?: string | null;
    price?: number | string | null;
    mesghalPrice?: number | string | null;
    quantity?: number | string | null;
    executedQuantity?: number | string | null;
  } | null;
}

export interface CreditUsage {
  /** Credit currency borrowed by credit BUYs. */
  borrowedIr: number;
  /** Credit currency returned by credit SELLs. */
  sellRevenueIr: number;
  /**
   * Credit line currently consumed: what was borrowed, less what selling has
   * already paid back, floored at zero. A round trip that is fully closed
   * consumes nothing.
   */
  usedCredit: number;
}

const num = (v: unknown) => Number(v) || 0;

/**
 * How much of a facility's credit line its trades are using right now.
 *
 * Only COMPLETED trades count — a pending order's amount is already held by the
 * wallet freeze (freeBalance → lockedBalance), which caps wallet capacity on its
 * own — and a CASHED_OUT trade has been paid off and left the facility.
 *
 * Usage is the **net open position**: a BUY borrows credit currency and a SELL
 * pays it back, so buying and selling the same position back out frees the line
 * again instead of consuming it twice. This is the same netting the settlement
 * engine's `computeFromOrders` applies, and the prices match it too — BUYs cost
 * the display price the customer was charged, SELLs return the pure price
 * (commission on a sale is taken in gold, not currency).
 *
 * A short leg (selling credit capacity in the base symbol) is not represented
 * here: that obligation is denominated in the base symbol, and the base-symbol
 * credit wallet's own capacity bounds it.
 */
export function computeCreditUsage(rows: CreditUsageRow[]): CreditUsage {
  let borrowedIr = new Decimal(0);
  let sellRevenueIr = new Decimal(0);

  for (const row of rows) {
    const o = row.order;
    if (!o) continue;
    if (String(o.status) !== "COMPLETED") continue;
    if (String(row.status) === "CASHED_OUT") continue;

    const buyPrice = num(o.price) || num(row.priceAtOrderTime);
    const qty = num(o.executedQuantity) > 0 ? num(o.executedQuantity) : num(o.quantity);
    if (!(qty > 0) || !(buyPrice > 0)) continue;

    if (String(o.side) === "SELL") {
      const purePrice = num(o.mesghalPrice) > 0 ? num(o.mesghalPrice) / MESQAL_TO_GRAM : buyPrice;
      sellRevenueIr = sellRevenueIr.plus(new Decimal(qty).mul(purePrice));
    } else {
      borrowedIr = borrowedIr.plus(new Decimal(qty).mul(buyPrice));
    }
  }

  return {
    borrowedIr: borrowedIr.toNumber(),
    sellRevenueIr: sellRevenueIr.toNumber(),
    usedCredit: Decimal.max(0, borrowedIr.minus(sellRevenueIr)).toNumber(),
  };
}

/** Net credit usage per facility, for callers that loaded several at once. */
export function groupCreditUsage<T extends CreditUsageRow & { creditId: string }>(
  rows: T[],
): Record<string, number> {
  const byCredit = new Map<string, T[]>();
  for (const row of rows) {
    const list = byCredit.get(row.creditId);
    if (list) list.push(row);
    else byCredit.set(row.creditId, [row]);
  }
  const map: Record<string, number> = {};
  for (const [creditId, group] of byCredit) {
    map[creditId] = computeCreditUsage(group).usedCredit;
  }
  return map;
}
