import { describe, expect, it } from "vitest";
import { fmtNum } from "./format";

/**
 * ui-parszargar's own formatter, copied from its `utils/helpers.js`. The panel
 * is meant to match it, so the test compares against the reference rather than
 * against a string I typed out.
 */
const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const toFa = (v: unknown) => String(v).replace(/[0-9]/g, (d) => FA[+d]);
const parszargarFmt = (v: number) =>
  toFa(Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "٬"));

describe("fmtNum", () => {
  it.each([0, 42, 1250, 1_250_000, 1_234_567])(
    "renders %d exactly as ui-parszargar does",
    (n) => {
      expect(fmtNum(n)).toBe(parszargarFmt(n));
    },
  );

  it("uses Persian digits, not Latin", () => {
    // The whole point: a Latin-digit count beside a Persian-digit amount on the
    // same row is what this alignment removes.
    expect(fmtNum(1250)).toBe("۱٬۲۵۰");
    expect(fmtNum(1250)).not.toMatch(/[0-9]/);
  });

  it("keeps the requested precision", () => {
    expect(fmtNum(2.5, 4)).toBe("۲٫۵");
    expect(fmtNum(1.23456789, 4)).toBe("۱٫۲۳۴۶");
  });

  it("shows an em dash for a missing value rather than zero", () => {
    // 0 is a real quantity; absent is not. Collapsing them would report an
    // empty warehouse and a warehouse of unknown size identically.
    for (const empty of [null, undefined, ""]) expect(fmtNum(empty)).toBe("—");
    expect(fmtNum(0)).toBe("۰");
  });

  it("shows an em dash for a value that is not a number", () => {
    expect(fmtNum("not-a-number")).toBe("—");
  });
});
