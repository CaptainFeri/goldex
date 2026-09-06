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
 * The panel is the only place in the system that converts, so a mistake here is
 * a factor-of-ten shown to an operator approving a payout.
 */
describe("money", () => {
  it("converts rial to toman and back", () => {
    expect(RIAL_PER_TOMAN).toBe(10);
    expect(rialToToman(1_250_000_000)).toBe(125_000_000);
    expect(tomanToRial(125_000_000)).toBe(1_250_000_000);
    expect(rialToToman(tomanToRial(42))).toBe(42);
  });

  it("accepts the decimal strings the API sends", () => {
    expect(rialToToman("1250000000.00000000")).toBe(125_000_000);
    expect(tomanToRial("125000000")).toBe(1_250_000_000);
  });

  it("returns null for missing input rather than 0", () => {
    // 0 would render as a real balance; null renders as "—".
    for (const empty of [null, undefined, "", "abc"]) {
      expect(rialToToman(empty as never)).toBeNull();
      expect(tomanToRial(empty as never)).toBeNull();
    }
  });

  it("formats rial as toman with the unit", () => {
    expect(fmtToman(1_250_000_000)).toBe("۱۲۵٬۰۰۰٬۰۰۰ تومان");
    expect(fmtToman(1_250_000_000, { unit: false })).toBe("۱۲۵٬۰۰۰٬۰۰۰");
    // Latin digits stay available for anywhere that needs them.
    expect(fmtToman(1_250_000_000, { unit: false, locale: "en-US" })).toBe("125,000,000");
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

  it("converts only rial amounts when formatting by symbol", () => {
    expect(fmtBySymbol(1_250_000_000, "IRR")).toBe("۱۲۵٬۰۰۰٬۰۰۰ تومان");
    // A gold balance is grams; dividing it by ten would be nonsense.
    expect(fmtBySymbol(12.5, "XAU", { unit: "گرم" })).toBe("۱۲٫۵ گرم");
  });
});

describe("form helpers", () => {
  it("labels a rial symbol in toman and everything else by its slug", () => {
    expect(unitLabel("IRR")).toBe("تومان");
    expect(unitLabel("XAU")).toBe("XAU");
    expect(unitLabel(null)).toBe("");
  });

  it("converts a typed rial-symbol amount back to rial", () => {
    expect(toApiAmount("1250", "IRR")).toBe(12500);
  });

  it("leaves a non-rial symbol's amount alone", () => {
    // Gold grams are already in the symbol's own units; converting would be a
    // ten-fold error in the other direction.
    expect(toApiAmount("2.5", "XAU")).toBe(2.5);
  });

  it("round-trips a rial amount through a form", () => {
    const fromApi = toFormAmount(12500, "IRR");
    expect(fromApi).toBe(1250);
    expect(toApiAmount(fromApi, "IRR")).toBe(12500);
  });

  it("returns null rather than 0 for a missing amount", () => {
    // 0 is a real balance; a blank field is not. Collapsing them would let an
    // empty input submit as a deliberate zero.
    expect(toApiAmount("", "IRR")).toBeNull();
    expect(toFormAmount(null, "XAU")).toBeNull();
  });
});
