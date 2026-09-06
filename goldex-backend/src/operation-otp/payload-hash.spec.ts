import { canonicalPayload, canonicalValue, hashPayload, refKeyOf } from "./payload-hash";

/**
 * These tests are the security property, not a formatting preference.
 *
 * Too loose and a code approving 5,000,000 also approves 500,000,000. Too
 * strict and an honest client whose JSON says "5000000.00" is rejected, which
 * teaches operators the mechanism is broken and gets it disabled.
 */
describe("canonicalValue", () => {
  it("collapses every spelling of the same amount", () => {
    const forms = [5000000, "5000000", "5000000.00", "+5000000", "05000000", "5e6", "5E6", " 5000000 "];
    const canon = forms.map(canonicalValue);
    expect(new Set(canon).size).toBe(1);
    expect(canon[0]).toBe("5000000");
  });

  it("keeps genuinely different amounts apart", () => {
    // The replay this module exists to prevent.
    expect(canonicalValue("5000000")).not.toBe(canonicalValue("500000000"));
    expect(canonicalValue("5000000")).not.toBe(canonicalValue("5000001"));
    expect(canonicalValue("5000000")).not.toBe(canonicalValue("-5000000"));
  });

  it("does not lose precision on large rial amounts", () => {
    // Number() would round this; the amounts here are exactly the ones that
    // must not be approximated.
    expect(canonicalValue("900719925474099123")).toBe("900719925474099123");
    expect(canonicalValue("9.00719925474099123e17")).toBe("900719925474099123");
  });

  it("keeps significant decimals and drops insignificant ones", () => {
    expect(canonicalValue("1.500")).toBe("1.5");
    expect(canonicalValue("0.125")).toBe("0.125");
    expect(canonicalValue(".5")).toBe("0.5");
    expect(canonicalValue("1.5")).not.toBe(canonicalValue("1.05"));
  });

  it("treats -0 and 0 as the same zero", () => {
    expect(canonicalValue("-0")).toBe("0");
    expect(canonicalValue("0.000")).toBe("0");
    expect(canonicalValue(0)).toBe("0");
  });

  it("distinguishes absent from zero", () => {
    // "no amount given" and "an amount of zero" are different operations.
    expect(canonicalValue(undefined)).toBe("");
    expect(canonicalValue(null)).toBe("");
    expect(canonicalValue("")).toBe("");
    expect(canonicalValue(0)).not.toBe(canonicalValue(null));
  });

  it("normalises booleans and leaves other text alone", () => {
    expect(canonicalValue(true)).toBe("true");
    expect(canonicalValue("IR820540102680020817909002")).toBe("IR820540102680020817909002");
    expect(canonicalValue(" شرکت زرین ")).toBe("شرکت زرین");
  });

  it("sorts arrays, so the same set hashes the same however it was ordered", () => {
    expect(canonicalValue(["b", "a", "c"])).toBe(canonicalValue(["c", "b", "a"]));
    expect(canonicalValue(["a", "b"])).not.toBe(canonicalValue(["a", "b", "c"]));
  });
});

describe("canonicalPayload", () => {
  const fields = ["walletId", "amount", "symbolId"];

  it("uses the declared field order, not the object's key order", () => {
    const a = { walletId: "w1", amount: "5000000", symbolId: "s1" };
    const b = { symbolId: "s1", amount: 5_000_000, walletId: "w1" };
    expect(canonicalPayload("wallet.deposit", "w1", fields, a))
      .toBe(canonicalPayload("wallet.deposit", "w1", fields, b));
  });

  it("ignores fields outside the descriptor", () => {
    // A client adding an unrelated key must not invalidate its own challenge.
    const base = { walletId: "w1", amount: "5000000", symbolId: "s1" };
    expect(canonicalPayload("wallet.deposit", "w1", fields, base))
      .toBe(canonicalPayload("wallet.deposit", "w1", fields, { ...base, note: "hello" }));
  });

  it("changes when the amount changes", () => {
    const small = { walletId: "w1", amount: "5000000", symbolId: "s1" };
    const large = { walletId: "w1", amount: "500000000", symbolId: "s1" };
    expect(hashPayload("wallet.deposit", "w1", fields, small))
      .not.toBe(hashPayload("wallet.deposit", "w1", fields, large));
  });

  it("changes when the scope or the reference changes", () => {
    const p = { walletId: "w1", amount: "5000000", symbolId: "s1" };
    expect(hashPayload("wallet.deposit", "w1", fields, p))
      .not.toBe(hashPayload("wallet.withdraw", "w1", fields, p));
    expect(hashPayload("wallet.deposit", "w1", fields, p))
      .not.toBe(hashPayload("wallet.deposit", "w2", fields, p));
  });

  it("cannot be confused by a value containing the separator", () => {
    // Without the `field=` prefixes, {a:"x|y", b:""} and {a:"x", b:"y"} would
    // canonicalise to the same string.
    const two = ["a", "b"];
    expect(canonicalPayload("s", "r", two, { a: "x|y", b: "" }))
      .not.toBe(canonicalPayload("s", "r", two, { a: "x", b: "y" }));
  });
});

describe("refKeyOf", () => {
  it("uses the id directly for a single reference", () => {
    expect(refKeyOf("w1")).toBe("w1");
  });

  it("is stable for a bulk set regardless of order", () => {
    expect(refKeyOf(null, ["b", "a"])).toBe(refKeyOf(null, ["a", "b"]));
  });

  it("differs for a different set", () => {
    expect(refKeyOf(null, ["a", "b"])).not.toBe(refKeyOf(null, ["a", "b", "c"]));
  });

  it("falls back to a placeholder when there is no reference", () => {
    expect(refKeyOf()).toBe("-");
    expect(refKeyOf(null, [])).toBe("-");
  });
});
