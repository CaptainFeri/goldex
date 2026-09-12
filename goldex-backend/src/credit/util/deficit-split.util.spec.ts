import { splitDeficit } from "./deficit-split.util";

/**
 * The collateral is quoted in grams and the deficit in the credit currency, so
 * every case here fixes a mark price and checks the two stay in step.
 */
describe("splitDeficit", () => {
  const MARK = 10; // credit currency per collateral unit

  it("returns nothing owed when there is no deficit", () => {
    expect(splitDeficit(0, 500, MARK)).toEqual({
      deficit: 0,
      consumedCollateral: 0,
      shortfall: 0,
    });
  });

  it("treats a negative deficit as nothing owed", () => {
    expect(splitDeficit(-120, 500, MARK)).toEqual({
      deficit: 0,
      consumedCollateral: 0,
      shortfall: 0,
    });
  });

  it("consumes collateral for a deficit the collateral covers", () => {
    // 200 owed at 10/unit = 20 units, well inside the 50 units of collateral.
    const r = splitDeficit(200, 500, MARK);
    expect(r.deficit).toBe(200);
    expect(r.consumedCollateral).toBe(20);
    expect(r.shortfall).toBe(0);
  });

  it("caps consumption at the collateral held and leaves the rest as shortfall", () => {
    // 800 owed but only 500 of collateral value (50 units) exists.
    const r = splitDeficit(800, 500, MARK);
    expect(r.consumedCollateral).toBe(50);
    expect(r.shortfall).toBe(300);
  });

  it("consumes exactly the collateral when the deficit equals its value", () => {
    const r = splitDeficit(500, 500, MARK);
    expect(r.consumedCollateral).toBe(50);
    expect(r.shortfall).toBe(0);
  });

  it("leaves the whole deficit as shortfall when no collateral backs it", () => {
    const r = splitDeficit(300, 0, MARK);
    expect(r.consumedCollateral).toBe(0);
    expect(r.shortfall).toBe(300);
  });

  // The escrow path calls this with the deficit already net of cash, so these
  // cases are what a funded settlement-workflow shortfall resolves to.
  it("consumes no collateral once cash has covered the deficit in full", () => {
    const covered = 200;
    const r = splitDeficit(200 - covered, 500, MARK);
    expect(r).toEqual({ deficit: 0, consumedCollateral: 0, shortfall: 0 });
  });

  it("consumes collateral only for the part cash did not cover", () => {
    // 800 owed, 500 funded from the deposit wallet → 300 left for collateral.
    const r = splitDeficit(800 - 500, 500, MARK);
    expect(r.deficit).toBe(300);
    expect(r.consumedCollateral).toBe(30);
    expect(r.shortfall).toBe(0);
  });

  it("keeps the split in proportion at fractional prices", () => {
    // 7 owed at 2.5 per unit = 2.8 units against 4 units of collateral.
    const r = splitDeficit(7, 10, 2.5);
    expect(r.consumedCollateral).toBeCloseTo(2.8, 8);
    expect(r.shortfall).toBe(0);
  });

  it("still caps against the collateral when the mark price is missing", () => {
    // Guard path: price falls back to 1, so value and quantity share a unit.
    const r = splitDeficit(800, 500, 0);
    expect(r.consumedCollateral).toBe(500);
    expect(r.shortfall).toBe(300);
  });
});
