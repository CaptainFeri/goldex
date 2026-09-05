import Decimal from "decimal.js";
import { isWholeToman, rialToToman, tomanToRial } from "./currency.helper";
import { RIAL_PER_TOMAN, RIAL_SYMBOL_SLUG, BANK_SYMBOL_SLUG } from "./constants/currency.constants";

/**
 * These tests are the guard rail for the entire money model: if the factor at
 * the bank boundary is wrong, every payout is wrong by an order of magnitude.
 */
describe("currency helper", () => {
  it("uses toman on the platform and rial at the bank", () => {
    expect(RIAL_SYMBOL_SLUG).toBe("IRT");
    expect(BANK_SYMBOL_SLUG).toBe("IRR");
    expect(RIAL_PER_TOMAN).toBe(10);
  });

  describe("tomanToRial", () => {
    it.each([
      ["1", "10"],
      ["0", "0"],
      ["125000000", "1250000000"],
      ["7462686.567", "74626865.67"],
    ])("converts %s toman to %s rial", (toman, rial) => {
      expect(tomanToRial(toman)).toBe(rial);
    });

    it("accepts numbers and Decimals", () => {
      expect(tomanToRial(42)).toBe("420");
      expect(tomanToRial(new Decimal("1.5"))).toBe("15");
    });

    it("treats null and undefined as zero", () => {
      expect(tomanToRial(null as never)).toBe("0");
      expect(tomanToRial(undefined as never)).toBe("0");
    });
  });

  describe("rialToToman", () => {
    it.each([
      ["10", "1"],
      ["0", "0"],
      ["1250000000", "125000000"],
      ["74626865.67", "7462686.567"],
    ])("converts %s rial to %s toman", (rial, toman) => {
      expect(rialToToman(rial)).toBe(toman);
    });

    it("divides exactly rather than rounding", () => {
      expect(rialToToman("15")).toBe("1.5");
    });
  });

  it("round-trips without drift at magnitudes a number would lose", () => {
    const amounts = ["1", "0.00000001", "999999999999.99999999", "74626865.67"];
    for (const amount of amounts) {
      expect(rialToToman(tomanToRial(amount))).toBe(new Decimal(amount).toFixed());
      expect(tomanToRial(rialToToman(amount))).toBe(new Decimal(amount).toFixed());
    }
  });

  describe("isWholeToman", () => {
    it("accepts rial amounts that divide evenly", () => {
      expect(isWholeToman("1250000000")).toBe(true);
      expect(isWholeToman("0")).toBe(true);
    });

    it("rejects a rial amount with a remainder", () => {
      expect(isWholeToman("15")).toBe(false);
    });
  });
});
