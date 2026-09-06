import { describe, expect, it } from "vitest";
import { fromWireDate, toWireDate } from "./dates";

/** A stand-in for the picker's DateObject, which exposes `toDate()`. */
const picked = (d: Date) => ({ toDate: () => d, isValid: true });

describe("toWireDate", () => {
  it("emits the Gregorian string the API already expects", () => {
    expect(toWireDate(picked(new Date(2026, 8, 5)))).toBe("2026-09-05");
  });

  it("keeps the day an operator picked, whatever the timezone", () => {
    // toISOString() would render local midnight in Tehran as the previous day.
    // A report window that silently moved back a day is exactly the bug this
    // sweep must not introduce.
    expect(toWireDate(picked(new Date(2026, 0, 1, 0, 30)))).toBe("2026-01-01");
    expect(toWireDate(picked(new Date(2026, 11, 31, 23, 30)))).toBe("2026-12-31");
  });

  it("carries the time when the field is a datetime", () => {
    expect(toWireDate(picked(new Date(2026, 8, 5, 14, 7)), "datetime")).toBe("2026-09-05T14:07");
  });

  it("drops the time when the field is date-only", () => {
    expect(toWireDate(picked(new Date(2026, 8, 5, 14, 7)))).toBe("2026-09-05");
  });

  it("returns an empty string when the field is cleared", () => {
    // Empty, not today: a cleared filter means "no bound", never "now".
    for (const empty of [null, undefined, ""]) expect(toWireDate(empty)).toBe("");
    expect(toWireDate({ toDate: () => new Date(NaN), isValid: false })).toBe("");
  });

  it("accepts a plain Date as well as the picker's object", () => {
    expect(toWireDate(new Date(2026, 8, 5))).toBe("2026-09-05");
  });
});

describe("fromWireDate", () => {
  it("parses a wire date as local time, not UTC", () => {
    const d = fromWireDate("2026-09-05")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 5]);
  });

  it("parses a wire datetime", () => {
    const d = fromWireDate("2026-09-05T14:07")!;
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 7]);
  });

  it("round-trips both shapes without drift", () => {
    for (const wire of ["2026-01-01", "2026-12-31", "2026-06-15"]) {
      expect(toWireDate(fromWireDate(wire))).toBe(wire);
    }
    const dt = "2026-09-05T14:07";
    expect(toWireDate(fromWireDate(dt), "datetime")).toBe(dt);
  });

  it("tolerates a full ISO string from the API", () => {
    const d = fromWireDate("2026-09-05T09:12:00.000Z")!;
    expect(d.getFullYear()).toBe(2026);
  });

  it("returns null for an empty or unparseable value", () => {
    for (const empty of [null, undefined, "", "not-a-date"]) {
      expect(fromWireDate(empty as any)).toBeNull();
    }
  });
});
