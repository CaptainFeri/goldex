import {
  RIAL_PER_TOMAN,
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
