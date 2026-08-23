import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { OrderSideEnum } from "../../order/enum/order.side.enum";
import { PendDeadlineStateEnum } from "../../credit/enum/pend-deadline-state.enum";

export interface PendDeadlines {
  warnAt: Date | null;
  expireAt: Date | null;
  graceEndAt: Date | null;
}

/**
 * Compute the pend-deadline timestamps for a credit-linked request from the
 * pair's per-side time limits: x = warn hours, y = expire hours,
 * z = post-expire grace hours. Returns null timestamps when the pair has no
 * limit configured for that side.
 */
export function computePendDeadlines(
  pair: PricePairEntity,
  side: OrderSideEnum | string,
  now: Date = new Date(),
): PendDeadlines {
  const isBuy = side === OrderSideEnum.BUY || side === "BUY";
  const warnHours = isBuy ? pair.buyWarnHours : pair.sellWarnHours;
  const expireHours = isBuy ? pair.buyExpireHours : pair.sellExpireHours;
  const graceHours = isBuy ? pair.buyGraceHours : pair.sellGraceHours;

  const add = (hours: number | null | undefined): Date | null =>
    hours == null ? null : new Date(now.getTime() + hours * 3600_000);

  return {
    warnAt: add(warnHours),
    expireAt: add(expireHours),
    graceEndAt: graceHours == null || !expireHours ? null : add(expireHours + graceHours),
  };
}

/** Initial state is GREEN whenever deadlines are stamped at all. */
export function initialPendDeadlineState(d: PendDeadlines): PendDeadlineStateEnum | null {
  if (!d.warnAt && !d.expireAt) return null;
  return PendDeadlineStateEnum.GREEN;
}
