import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { OrderSideEnum } from "../../order/enum/order.side.enum";
import { PendDeadlineStateEnum } from "../../credit/enum/pend-deadline-state.enum";

export interface PendDeadlines {
  warnAt: Date | null;
  expireAt: Date | null;
  graceEndAt: Date | null;
}

/**
 * Calculate the next valid date/time, skipping excluded days.
 * @param date - The date to check
 * @param excludedDays - Array of excluded days (0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday)
 * @returns The next valid date/time
 */
function getNextValidDate(date: Date, excludedDays: number[] | null): Date {
  if (!excludedDays || excludedDays.length === 0) {
    return date;
  }

  let result = new Date(date);
  let dayOfWeek = result.getDay();

  // Keep moving forward until we find a non-excluded day
  while (excludedDays.includes(dayOfWeek)) {
    result.setDate(result.getDate() + 1);
    // Set to start of day (00:00:00)
    result.setHours(0, 0, 0, 0);
    dayOfWeek = result.getDay();
  }

  return result;
}

/**
 * Compute the pend-deadline timestamps for a credit-linked request from the
 * pair's per-side time limits: x = warn hours, y = expire hours,
 * z = post-expire grace hours. Returns null timestamps when the pair has no
 * limit configured for that side.
 * 
 * Excluded days (e.g., Friday) are skipped when calculating deadlines.
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
  const excludedDays = pair.excludedDays || null;

  const add = (hours: number | null | undefined): Date | null => {
    if (hours == null) return null;
    const date = new Date(now.getTime() + hours * 3600_000);
    return getNextValidDate(date, excludedDays);
  };

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
