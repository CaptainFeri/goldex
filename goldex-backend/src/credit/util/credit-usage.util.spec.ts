import { computeCreditUsage, groupCreditUsage } from "./credit-usage.util";
import { MESQAL_TO_GRAM } from "../../common/constants";

const buy = (qty: number, price: number, over: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  priceAtOrderTime: price,
  order: { status: "COMPLETED", side: "BUY", price, quantity: qty, executedQuantity: qty },
  ...over,
});

const sell = (qty: number, price: number, over: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  priceAtOrderTime: price,
  order: { status: "COMPLETED", side: "SELL", price, quantity: qty, executedQuantity: qty },
  ...over,
});

describe("computeCreditUsage", () => {
  it("reports nothing used for a facility that has not traded", () => {
    expect(computeCreditUsage([])).toEqual({
      borrowedIr: 0,
      sellRevenueIr: 0,
      usedCredit: 0,
    });
  });

  it("counts a credit BUY as borrowed", () => {
    const r = computeCreditUsage([buy(50, 10)]);
    expect(r.borrowedIr).toBe(500);
    expect(r.usedCredit).toBe(500);
  });

  // The reason this util exists: the old side-agnostic sum charged a closed
  // round trip twice and never gave the line back.
  it("frees the line when a position is sold back out at the same price", () => {
    const r = computeCreditUsage([buy(50, 10), sell(50, 10)]);
    expect(r.borrowedIr).toBe(500);
    expect(r.sellRevenueIr).toBe(500);
    expect(r.usedCredit).toBe(0);
  });

  it("frees the line entirely when the round trip made a profit", () => {
    const r = computeCreditUsage([buy(50, 10), sell(50, 12)]);
    expect(r.usedCredit).toBe(0);
  });

  it("leaves the loss on the line when the round trip lost money", () => {
    // Borrowed 500, sold back for 400 — 100 of the line is still consumed.
    const r = computeCreditUsage([buy(50, 10), sell(50, 8)]);
    expect(r.usedCredit).toBe(100);
  });

  it("keeps a partly closed position partly consuming the line", () => {
    const r = computeCreditUsage([buy(50, 10), sell(20, 10)]);
    expect(r.usedCredit).toBe(300);
  });

  it("does not report negative usage when selling outruns borrowing", () => {
    const r = computeCreditUsage([sell(50, 10)]);
    expect(r.sellRevenueIr).toBe(500);
    expect(r.usedCredit).toBe(0);
  });

  it("prices a SELL at the pure price, matching the settlement engine", () => {
    // Commission on a sale is taken in gold, so the currency leg is the pure
    // price carried on mesghalPrice, not the discounted display price.
    const pureGram = 10;
    const r = computeCreditUsage([
      sell(50, 9, {
        order: {
          status: "COMPLETED",
          side: "SELL",
          price: 9,
          mesghalPrice: pureGram * MESQAL_TO_GRAM,
          quantity: 50,
          executedQuantity: 50,
        },
      }),
    ]);
    expect(r.sellRevenueIr).toBeCloseTo(500, 6);
  });

  it("ignores trades that have not completed", () => {
    const pending = buy(50, 10, {
      order: { status: "PENDING", side: "BUY", price: 10, quantity: 50, executedQuantity: 0 },
    });
    expect(computeCreditUsage([pending]).usedCredit).toBe(0);
  });

  it("ignores a cashed-out trade, which has left the facility", () => {
    const rows = [buy(50, 10), buy(20, 10, { status: "CASHED_OUT" })];
    expect(computeCreditUsage(rows).usedCredit).toBe(500);
  });

  it("ignores a credit link whose order was not loaded", () => {
    expect(computeCreditUsage([{ status: "COMPLETED", order: null }]).usedCredit).toBe(0);
  });

  it("falls back to the ordered quantity when no executed quantity is recorded", () => {
    const r = computeCreditUsage([
      buy(0, 10, {
        order: { status: "COMPLETED", side: "BUY", price: 10, quantity: 50, executedQuantity: 0 },
      }),
    ]);
    expect(r.borrowedIr).toBe(500);
  });

  it("falls back to the credit link's price when the order carries none", () => {
    const r = computeCreditUsage([
      {
        status: "COMPLETED",
        priceAtOrderTime: 10,
        order: { status: "COMPLETED", side: "BUY", price: 0, quantity: 50, executedQuantity: 50 },
      },
    ]);
    expect(r.borrowedIr).toBe(500);
  });
});

describe("groupCreditUsage", () => {
  it("nets each facility on its own", () => {
    // A's sell revenue must never pay down B's borrowing.
    const rows = [
      { ...buy(50, 10), creditId: "A" },
      { ...sell(50, 10), creditId: "A" },
      { ...buy(30, 10), creditId: "B" },
    ];
    expect(groupCreditUsage(rows)).toEqual({ A: 0, B: 300 });
  });

  it("returns nothing for an empty set", () => {
    expect(groupCreditUsage([])).toEqual({});
  });
});
