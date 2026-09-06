import { describe, expect, it } from "vitest";
import { orDash } from "../pages/ApiPage";
import { toApiAmount, toFormAmount } from "./money";

/**
 * The server reports null for an average or a rate it could not compute, and
 * the panel must not turn that into a number. "100%" or "0 ms" over no traffic
 * is a figure an operator would act on.
 */
describe("orDash", () => {
  it("renders a dash for null rather than inventing a number", () => {
    expect(orDash(null)).toBe("—");
    expect(orDash(null, "٪")).toBe("—");
    expect(orDash(null, " ms")).toBe("—");
  });

  it("does not treat a real zero as missing", () => {
    // An error rate of exactly 0% is a fact, not an absence.
    expect(orDash(0, "٪")).toContain("٪");
    expect(orDash(0, "٪")).not.toBe("—");
  });

  it("formats a value with its suffix", () => {
    expect(orDash(86, " ms")).toContain("ms");
    expect(orDash(99.13, "٪")).toContain("٪");
  });
});

/**
 * The withdrawal floor is entered and stored in rial. It still goes through the
 * money helpers so the unit stays decided in one place, and a round trip must
 * come back with the figure the operator saw.
 */
describe("platform minWithdrawal conversion", () => {
  it("round-trips a rial amount through the form field", () => {
    const fromServerRial = "50000000";
    const shownInForm = toFormAmount(fromServerRial, "IRR");
    expect(shownInForm).toBe(50_000_000);
    expect(toApiAmount(String(shownInForm), "IRR")).toBe(50_000_000);
  });

  it("keeps zero as zero in both directions", () => {
    expect(toFormAmount("0", "IRR")).toBe(0);
    expect(toApiAmount("0", "IRR")).toBe(0);
  });
});
