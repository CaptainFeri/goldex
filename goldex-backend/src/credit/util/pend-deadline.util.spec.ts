import {
  DeadlinePolicy,
  DEFAULT_DEADLINE_TIMEZONE,
  parseClockTime,
  resolvePendDeadlines,
} from "./pend-deadline.util";
import { CreditDeadlineModeEnum } from "../enum/credit-deadline-mode.enum";

// Tehran runs at a fixed +03:30 with no DST, so a wall-clock time maps to one
// instant; these helpers keep the expectations readable.
const tehran = (iso: string) => new Date(`${iso}+03:30`);

function policy(over: Partial<DeadlinePolicy> = {}): DeadlinePolicy {
  return {
    mode: CreditDeadlineModeEnum.RELATIVE,
    warnHours: null,
    expireHours: null,
    graceHours: null,
    warnTime: null,
    expireTime: null,
    timezone: DEFAULT_DEADLINE_TIMEZONE,
    excludedDays: [],
    holidayDates: [],
    ...over,
  };
}

describe("parseClockTime", () => {
  it("accepts a 24h wall clock and rejects anything else", () => {
    expect(parseClockTime("14:00")).toBe(840);
    expect(parseClockTime("00:00")).toBe(0);
    expect(parseClockTime("23:59")).toBe(1439);
    expect(parseClockTime("24:00")).toBeNull();
    expect(parseClockTime("9:00")).toBeNull();
    expect(parseClockTime("")).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
});

describe("resolvePendDeadlines — NONE", () => {
  it("never ages a request", () => {
    const d = resolvePendDeadlines(
      policy({ mode: CreditDeadlineModeEnum.NONE, expireHours: 1, expireTime: "14:00" }),
      tehran("2026-09-09T10:00:00"),
    );
    expect(d).toEqual({ warnAt: null, expireAt: null, graceEndAt: null });
  });
});

describe("resolvePendDeadlines — RELATIVE", () => {
  // "Havaleh, same-day": resolved within an hour of registration.
  it("counts hours from the moment of registration", () => {
    const d = resolvePendDeadlines(
      policy({ warnHours: 0.5, expireHours: 1, graceHours: 1 }),
      tehran("2026-09-09T10:00:00"),
    );
    expect(d.warnAt).toEqual(tehran("2026-09-09T10:30:00"));
    expect(d.expireAt).toEqual(tehran("2026-09-09T11:00:00"));
    expect(d.graceEndAt).toEqual(tehran("2026-09-09T12:00:00"));
  });

  it("keeps the time of day when rolling off a closed day", () => {
    // Thursday 20:00 + 12h lands Friday 08:00; Friday (5) is closed, so the
    // deadline moves to Saturday at the same 08:00 — not to midnight.
    const d = resolvePendDeadlines(
      policy({ expireHours: 12, excludedDays: [5] }),
      tehran("2026-09-10T20:00:00"),
    );
    expect(new Date(tehran("2026-09-10T20:00:00")).getUTCDay()).toBe(4); // Thursday
    expect(d.expireAt).toEqual(tehran("2026-09-12T08:00:00"));
  });

  it("skips a dated holiday exception too", () => {
    const d = resolvePendDeadlines(
      policy({ expireHours: 24, holidayDates: ["2026-09-10"] }),
      tehran("2026-09-09T09:00:00"),
    );
    expect(d.expireAt).toEqual(tehran("2026-09-11T09:00:00"));
  });

  it("never lets the warning outlive the expiry", () => {
    const d = resolvePendDeadlines(
      policy({ warnHours: 5, expireHours: 2 }),
      tehran("2026-09-09T10:00:00"),
    );
    expect(d.warnAt).toEqual(d.expireAt);
  });

  it("leaves grace unset when the side has no expiry", () => {
    const d = resolvePendDeadlines(
      policy({ warnHours: 2, graceHours: 3 }),
      tehran("2026-09-09T10:00:00"),
    );
    expect(d.expireAt).toBeNull();
    expect(d.graceEndAt).toBeNull();
  });
});

describe("resolvePendDeadlines — DAILY_CUTOFF", () => {
  const cutoff = (over: Partial<DeadlinePolicy> = {}) =>
    policy({
      mode: CreditDeadlineModeEnum.DAILY_CUTOFF,
      warnTime: "12:00",
      expireTime: "14:00",
      graceHours: 2,
      ...over,
    });

  // "Molten gold, cash": settled by 14:00 on the day it is traded.
  it("falls due at today's cutoff for a request made before it", () => {
    const d = resolvePendDeadlines(cutoff(), tehran("2026-09-09T10:00:00"));
    expect(d.warnAt).toEqual(tehran("2026-09-09T12:00:00"));
    expect(d.expireAt).toEqual(tehran("2026-09-09T14:00:00"));
    expect(d.graceEndAt).toEqual(tehran("2026-09-09T16:00:00"));
  });

  it("rolls to the next day's cutoff for a request made after it", () => {
    const d = resolvePendDeadlines(cutoff(), tehran("2026-09-09T15:00:00"));
    expect(d.expireAt).toEqual(tehran("2026-09-10T14:00:00"));
    expect(d.warnAt).toEqual(tehran("2026-09-10T12:00:00"));
  });

  it("pins the warning to the expiry when only the expiry rolls over", () => {
    // 13:00 is past the 12:00 warn but before the 14:00 expiry: the request is
    // due today, so it is already in warning rather than warned tomorrow.
    const d = resolvePendDeadlines(cutoff(), tehran("2026-09-09T13:00:00"));
    expect(d.expireAt).toEqual(tehran("2026-09-09T14:00:00"));
    expect(d.warnAt).toEqual(d.expireAt);
  });

  it("skips weekly closures and dated holidays when rolling", () => {
    // Thursday after the cutoff → Friday is closed and Saturday is a holiday,
    // so the request is due at Sunday's cutoff.
    const d = resolvePendDeadlines(
      cutoff({ excludedDays: [5], holidayDates: ["2026-09-12"] }),
      tehran("2026-09-10T15:00:00"),
    );
    expect(d.expireAt).toEqual(tehran("2026-09-13T14:00:00"));
  });

  it("carries the grace past a closed day at the same clock time", () => {
    // Thursday 14:00 cutoff + 2h grace = Thursday 16:00, still open.
    const open = resolvePendDeadlines(cutoff({ excludedDays: [5] }), tehran("2026-09-10T09:00:00"));
    expect(open.graceEndAt).toEqual(tehran("2026-09-10T16:00:00"));
    // A 12h grace would land Friday 02:00, which is closed → Saturday 02:00.
    const rolled = resolvePendDeadlines(
      cutoff({ excludedDays: [5], graceHours: 12 }),
      tehran("2026-09-10T09:00:00"),
    );
    expect(rolled.graceEndAt).toEqual(tehran("2026-09-12T02:00:00"));
  });

  it("has no deadline when the side sets no cutoff time", () => {
    const d = resolvePendDeadlines(cutoff({ warnTime: null, expireTime: null }));
    expect(d).toEqual({ warnAt: null, expireAt: null, graceEndAt: null });
  });

  it("honours a non-Tehran desk timezone", () => {
    const d = resolvePendDeadlines(
      cutoff({ timezone: "UTC", warnTime: null }),
      new Date("2026-09-09T10:00:00Z"),
    );
    expect(d.expireAt).toEqual(new Date("2026-09-09T14:00:00Z"));
  });
});
