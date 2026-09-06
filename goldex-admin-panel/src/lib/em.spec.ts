import { describe, expect, it } from "vitest";
import { timeLeft, EM_STATUS_LABELS, EM_STATUS_KINDS, EM_TYPE_LABELS } from "./em";

/**
 * The plan calls the pre-rendered durations in the EM mock out specifically:
 * they go stale in an open tab. So the server sends a timestamp and this
 * renders it — which only helps if it renders the right thing.
 */
describe("timeLeft", () => {
  // Persian digits throughout, matching every other number on the page.
  const now = new Date("2026-09-06T12:00:00Z");

  it("renders days and hours for a distant deadline", () => {
    expect(timeLeft("2026-09-08T15:00:00Z", now)).toBe("۲ روز و ۳ ساعت");
  });

  it("renders hours and minutes within a day", () => {
    expect(timeLeft("2026-09-06T15:30:00Z", now)).toBe("۳ ساعت و ۳۰ دقیقه");
  });

  it("renders minutes for the last hour", () => {
    expect(timeLeft("2026-09-06T12:45:00Z", now)).toBe("۴۵ دقیقه");
  });

  it("never shows zero minutes for a row that has not expired yet", () => {
    // "0 دقیقه" reads as already dead; it is not.
    expect(timeLeft("2026-09-06T12:00:30Z", now)).toBe("۱ دقیقه");
  });

  it("says so plainly once the deadline has passed", () => {
    expect(timeLeft("2026-09-06T11:59:00Z", now)).toBe("منقضی شده");
    expect(timeLeft("2026-09-06T12:00:00Z", now)).toBe("منقضی شده");
  });

  it("returns a dash when there is no deadline, rather than an epoch", () => {
    expect(timeLeft(null, now)).toBe("—");
    expect(timeLeft("not a date", now)).toBe("—");
  });
});

describe("label maps", () => {
  it("covers every status the API can return", () => {
    for (const s of ["awaiting_account", "awaiting_receipt", "receipt_paid", "rejected", "closed"] as const) {
      expect(EM_STATUS_LABELS[s]).toBeTruthy();
      expect(EM_STATUS_KINDS[s]).toBeTruthy();
    }
  });

  it("marks rejected differently from paid", () => {
    expect(EM_STATUS_KINDS.rejected).not.toBe(EM_STATUS_KINDS.receipt_paid);
  });

  it("covers every request type, including the one nothing produces yet", () => {
    // `transfer` has no P2P source, but a row must never render as undefined.
    for (const t of ["withdraw", "deposit", "settlement", "transfer"] as const) {
      expect(EM_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});
