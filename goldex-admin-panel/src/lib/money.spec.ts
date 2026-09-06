import {
  RIAL_PER_TOMAN,
  toApiAmount,
  toFormAmount,
  unitLabel,
  fmtAmount,
  fmtBySymbol,
  fmtToman,
  isRialSymbol,
  rialToToman,
  tomanToRial,
} from "./money";

/**
 * The panel decides the unit in one place, so a mistake here is a wrong figure
 * shown to an operator approving a payout.
 */
describe("money", () => {
  it("passes rial through in both directions", () => {
    // The panel shows rial end to end; the helpers no longer rescale.
    expect(rialToToman(1_250_000_000)).toBe(1_250_000_000);
    expect(tomanToRial(1_250_000_000)).toBe(1_250_000_000);
    expect(rialToToman(tomanToRial(42))).toBe(42);
  });

  it("documents the old ratio without applying it", () => {
    expect(RIAL_PER_TOMAN).toBe(10);
    expect(rialToToman(10)).toBe(10);
  });

  it("accepts the decimal strings the API sends", () => {
    expect(rialToToman("1250000000.00000000")).toBe(1_250_000_000);
    expect(tomanToRial("125000000")).toBe(125_000_000);
  });

  it("returns null for missing input rather than 0", () => {
    // 0 would render as a real balance; null renders as "—".
    for (const empty of [null, undefined, "", "abc"]) {
      expect(rialToToman(empty as never)).toBeNull();
      expect(tomanToRial(empty as never)).toBeNull();
    }
  });

  it("formats rial with the unit", () => {
    expect(fmtToman(1_250_000_000)).toBe("۱٬۲۵۰٬۰۰۰٬۰۰۰ ریال");
    expect(fmtToman(1_250_000_000, { unit: false })).toBe("۱٬۲۵۰٬۰۰۰٬۰۰۰");
    // Latin digits stay available for anywhere that needs them.
    expect(fmtToman(1_250_000_000, { unit: false, locale: "en-US" })).toBe("1,250,000,000");
    expect(fmtToman(null)).toBe("—");
  });

  it("leaves non-rial amounts in their own unit", () => {
    expect(fmtAmount(12.5, "گرم")).toBe("۱۲٫۵ گرم");
    expect(fmtAmount(null)).toBe("—");
  });

  it("recognises the rial symbol case-insensitively", () => {
    expect(isRialSymbol("IRR")).toBe(true);
    expect(isRialSymbol("irr")).toBe(true);
    expect(isRialSymbol("XAU")).toBe(false);
    expect(isRialSymbol(null)).toBe(false);
  });

  it("labels rial amounts and leaves other symbols in their own unit", () => {
    expect(fmtBySymbol(1_250_000_000, "IRR")).toBe("۱٬۲۵۰٬۰۰۰٬۰۰۰ ریال");
    // A gold balance is grams, not a currency amount.
    expect(fmtBySymbol(12.5, "XAU", { unit: "گرم" })).toBe("۱۲٫۵ گرم");
  });
});

describe("form helpers", () => {
  it("labels a rial symbol in rial and everything else by its slug", () => {
    expect(unitLabel("IRR")).toBe("ریال");
    expect(unitLabel("XAU")).toBe("XAU");
    expect(unitLabel(null)).toBe("");
  });

  it("posts a typed rial amount unchanged", () => {
    expect(toApiAmount("1250", "IRR")).toBe(1250);
  });

  it("leaves a non-rial symbol's amount alone", () => {
    expect(toApiAmount("2.5", "XAU")).toBe(2.5);
  });

  it("round-trips a rial amount through a form", () => {
    const fromApi = toFormAmount(12500, "IRR");
    expect(fromApi).toBe(12500);
    expect(toApiAmount(fromApi, "IRR")).toBe(12500);
  });

  it("returns null rather than 0 for a missing amount", () => {
    // 0 is a real balance; a blank field is not. Collapsing them would let an
    // empty input submit as a deliberate zero.
    expect(toApiAmount("", "IRR")).toBeNull();
    expect(toFormAmount(null, "XAU")).toBeNull();
  });
});
