import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { OrderSideEnum } from "../../order/enum/order.side.enum";
import { PendDeadlineStateEnum } from "../../credit/enum/pend-deadline-state.enum";
import {
  CreditDeadlineModeEnum,
  DEFAULT_DEADLINE_TIMEZONE,
} from "../../credit/enum/credit-deadline-mode.enum";

export { DEFAULT_DEADLINE_TIMEZONE };

export interface PendDeadlines {
  warnAt: Date | null;
  expireAt: Date | null;
  graceEndAt: Date | null;
}

/** The deadline convention of one side of one pair, flattened for the solver. */
export interface DeadlinePolicy {
  mode: CreditDeadlineModeEnum;
  /** RELATIVE: hours counted from the moment the request is registered. */
  warnHours: number | null;
  expireHours: number | null;
  /** Hours of grace granted after the expiry, in either mode. */
  graceHours: number | null;
  /** DAILY_CUTOFF: wall-clock times "HH:mm" in the pair's timezone. */
  warnTime: string | null;
  expireTime: string | null;
  timezone: string;
  /** Weekly closures, 0=Sunday … 6=Saturday. */
  excludedDays: number[];
  /** Dated exceptions ("YYYY-MM-DD") on top of the weekly closures. */
  holidayDates: string[];
}

/** Calendar day in a given zone, plus the weekday that day falls on there. */
interface ZonedDay {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse "HH:mm" into minutes past midnight; null for anything malformed. */
export function parseClockTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = HHMM.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Intl formatters are expensive to build and these are hit per order, so the
// few timezones a deployment actually uses are cached.
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = partsFormatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsFormatters.set(timezone, fmt);
  }
  return fmt;
}

/** Wall-clock reading of an instant in a timezone. */
function zonedParts(instant: Date, timezone: string) {
  const parts = partsFormatter(timezone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/**
 * The instant at which a zone's wall clock reads the given date and time.
 *
 * Node has no first-party zoned-time constructor, so this guesses with the UTC
 * interpretation and corrects by the offset the zone actually had at that
 * guess. Two passes settle it even across a DST transition, and the result is
 * re-checked so a time that does not exist locally (the spring-forward gap)
 * lands on the following real instant instead of silently shifting a day.
 */
function zonedTimeToUtc(
  day: { year: number; month: number; day: number },
  minutesPastMidnight: number,
  timezone: string,
): Date {
  const hour = Math.floor(minutesPastMidnight / 60);
  const minute = minutesPastMidnight % 60;
  const asUtc = Date.UTC(day.year, day.month - 1, day.day, hour, minute, 0, 0);
  let guess = new Date(asUtc);
  for (let i = 0; i < 2; i += 1) {
    const seen = zonedParts(guess, timezone);
    const seenAsUtc = Date.UTC(
      seen.year,
      seen.month - 1,
      seen.day,
      seen.hour,
      seen.minute,
      seen.second,
      0,
    );
    const offset = seenAsUtc - guess.getTime();
    const next = new Date(asUtc - offset);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM-DD" for a calendar day, the shape holiday exceptions are stored in. */
function isoDate(day: { year: number; month: number; day: number }): string {
  return `${day.year}-${pad2(day.month)}-${pad2(day.day)}`;
}

/** Advance a calendar day by one, without touching any timezone. */
function nextDay(day: ZonedDay, timezone: string): ZonedDay {
  const noon = Date.UTC(day.year, day.month - 1, day.day + 1, 12, 0, 0, 0);
  const p = zonedParts(new Date(noon), timezone);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}

function normalizeHolidays(dates: string[] | null | undefined): string[] {
  if (!dates?.length) return [];
  return dates.map((d) => String(d).slice(0, 10));
}

/** A day the desk is open: neither a weekly closure nor a dated exception. */
export function isBusinessDay(day: ZonedDay, policy: DeadlinePolicy): boolean {
  if (policy.excludedDays.includes(day.weekday)) return false;
  return !policy.holidayDates.includes(isoDate(day));
}

function dayOf(instant: Date, timezone: string): ZonedDay {
  const p = zonedParts(instant, timezone);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
}

// A pair can at most be closed for a stretch; this bounds the search so a
// misconfiguration (every weekday excluded) fails loudly instead of hanging.
const MAX_DAY_SCAN = 370;

/**
 * Roll an instant forward to the next open day, preserving its time of day.
 * A deadline that lands on a closed day is due at the same clock time on the
 * next day the desk is open — not at midnight, and not on the closed day.
 */
function rollToBusinessDay(instant: Date, policy: DeadlinePolicy): Date | null {
  const p = zonedParts(instant, policy.timezone);
  const minutes = p.hour * 60 + p.minute;
  let day: ZonedDay = { year: p.year, month: p.month, day: p.day, weekday: p.weekday };
  for (let i = 0; i < MAX_DAY_SCAN; i += 1) {
    if (isBusinessDay(day, policy)) {
      // The first candidate keeps the original seconds; later ones start clean.
      return i === 0 ? instant : zonedTimeToUtc(day, minutes, policy.timezone);
    }
    day = nextDay(day, policy.timezone);
  }
  return null;
}

/**
 * The next occurrence of a wall-clock time on an open day, strictly after
 * `after`. A request registered past today's cutoff is due at the next open
 * day's cutoff.
 */
function nextCutoff(after: Date, minutes: number, policy: DeadlinePolicy): Date | null {
  let day = dayOf(after, policy.timezone);
  for (let i = 0; i < MAX_DAY_SCAN; i += 1) {
    if (isBusinessDay(day, policy)) {
      const candidate = zonedTimeToUtc(day, minutes, policy.timezone);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
    day = nextDay(day, policy.timezone);
  }
  return null;
}

/** Read one side of a pair's credit-deadline convention. */
export function readPairDeadlinePolicy(
  pair: PricePairEntity,
  side: OrderSideEnum | string,
): DeadlinePolicy {
  const isBuy = side === OrderSideEnum.BUY || side === "BUY";
  const rawMode = isBuy ? pair.buyDeadlineMode : pair.sellDeadlineMode;
  return {
    // Pairs configured before the mode existed carry hour columns only, so an
    // unset mode still means the relative convention.
    mode: rawMode || CreditDeadlineModeEnum.RELATIVE,
    warnHours: isBuy ? (pair.buyWarnHours ?? null) : (pair.sellWarnHours ?? null),
    expireHours: isBuy ? (pair.buyExpireHours ?? null) : (pair.sellExpireHours ?? null),
    graceHours: isBuy ? (pair.buyGraceHours ?? null) : (pair.sellGraceHours ?? null),
    warnTime: isBuy ? (pair.buyWarnTime ?? null) : (pair.sellWarnTime ?? null),
    expireTime: isBuy ? (pair.buyExpireTime ?? null) : (pair.sellExpireTime ?? null),
    timezone: pair.deadlineTimezone || DEFAULT_DEADLINE_TIMEZONE,
    excludedDays: pair.excludedDays || [],
    holidayDates: normalizeHolidays(pair.holidayDates),
  };
}

/**
 * Compute the pend-deadline timestamps for a credit-linked request from the
 * pair's convention for that side. Returns null timestamps whenever the side
 * has no deadline configured — the caller then leaves the request unaged.
 */
export function computePendDeadlines(
  pair: PricePairEntity,
  side: OrderSideEnum | string,
  now: Date = new Date(),
): PendDeadlines {
  return resolvePendDeadlines(readPairDeadlinePolicy(pair, side), now);
}

/** The deadline solver itself, separated from how a pair stores its policy. */
export function resolvePendDeadlines(policy: DeadlinePolicy, now: Date = new Date()): PendDeadlines {
  const none: PendDeadlines = { warnAt: null, expireAt: null, graceEndAt: null };
  if (policy.mode === CreditDeadlineModeEnum.NONE) return none;

  let warnAt: Date | null = null;
  let expireAt: Date | null = null;

  if (policy.mode === CreditDeadlineModeEnum.DAILY_CUTOFF) {
    const expireMinutes = parseClockTime(policy.expireTime);
    const warnMinutes = parseClockTime(policy.warnTime);
    expireAt = expireMinutes == null ? null : nextCutoff(now, expireMinutes, policy);
    if (warnMinutes != null) {
      // The warning belongs to the same settlement day as the expiry: it is the
      // last occurrence of the warn time at or before the expiry, so an
      // after-hours request warns on the day it is actually due.
      const candidate = nextCutoff(now, warnMinutes, policy);
      warnAt =
        candidate && expireAt && candidate.getTime() > expireAt.getTime() ? expireAt : candidate;
    }
  } else {
    const add = (hours: number | null): Date | null => {
      if (hours == null) return null;
      return rollToBusinessDay(new Date(now.getTime() + hours * 3600_000), policy);
    };
    expireAt = add(policy.expireHours);
    warnAt = add(policy.warnHours);
    if (warnAt && expireAt && warnAt.getTime() > expireAt.getTime()) warnAt = expireAt;
  }

  const graceEndAt =
    expireAt && policy.graceHours != null
      ? rollToBusinessDay(new Date(expireAt.getTime() + policy.graceHours * 3600_000), policy)
      : null;

  if (!warnAt && !expireAt) return none;
  return { warnAt, expireAt, graceEndAt };
}

/** Initial state is GREEN whenever deadlines are stamped at all. */
export function initialPendDeadlineState(d: PendDeadlines): PendDeadlineStateEnum | null {
  if (!d.warnAt && !d.expireAt) return null;
  return PendDeadlineStateEnum.GREEN;
}

/**
 * Reject a deadline configuration that cannot produce a deadline.
 *
 * These are all admin-entered, and every one of them fails at order time rather
 * than at save time if it slips through: an unknown timezone makes `Intl` throw
 * inside the order path, a DAILY_CUTOFF side with no cutoff silently stops
 * ageing requests, and a pair closed every day of the week can never fall due.
 * Returns the problems so the caller can raise them together.
 */
export function validateDeadlineConfig(pair: {
  buyDeadlineMode?: CreditDeadlineModeEnum | null;
  sellDeadlineMode?: CreditDeadlineModeEnum | null;
  buyExpireTime?: string | null;
  buyWarnTime?: string | null;
  sellExpireTime?: string | null;
  sellWarnTime?: string | null;
  deadlineTimezone?: string | null;
  excludedDays?: number[] | null;
  holidayDates?: string[] | null;
}): string[] {
  const problems: string[] = [];

  const timezone = pair.deadlineTimezone;
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      problems.push(`deadlineTimezone "${timezone}" is not a known IANA timezone`);
    }
  }

  const sides = [
    { name: "buy", mode: pair.buyDeadlineMode, expire: pair.buyExpireTime, warn: pair.buyWarnTime },
    {
      name: "sell",
      mode: pair.sellDeadlineMode,
      expire: pair.sellExpireTime,
      warn: pair.sellWarnTime,
    },
  ];
  for (const side of sides) {
    if (side.mode !== CreditDeadlineModeEnum.DAILY_CUTOFF) continue;
    if (parseClockTime(side.expire) == null) {
      problems.push(`${side.name}ExpireTime is required as HH:mm when ${side.name} uses DAILY_CUTOFF`);
    }
    if (side.warn && parseClockTime(side.warn) == null) {
      problems.push(`${side.name}WarnTime must be a 24h HH:mm time`);
    }
  }

  const excluded = pair.excludedDays ?? [];
  if (new Set(excluded).size >= 7) {
    problems.push("excludedDays cannot close the pair on every day of the week");
  }

  for (const date of pair.holidayDates ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      problems.push(`holidayDates entry "${date}" is not a YYYY-MM-DD date`);
    }
  }

  return problems;
}
