import { describe, expect, it } from "vitest";
import { toApiAmount, toFormAmount, fmtToman } from "./money";
import { canonicalPayload, hashPayload } from "./operation-otp";

/**
 * The transfer form takes toman and the wire carries rial. Getting that
 * direction wrong moves ten times the intended amount, and the OTP would
 * happily confirm it — the code is bound to whatever the panel computed, so
 * the conversion has to be right *before* the hash is taken.
 */
describe("shahin transfer amounts", () => {
  it("sends rial for an amount typed in toman", () => {
    expect(toApiAmount("1500000", "IRR")).toBe(15_000_000);
  });

  it("round-trips a rial figure back into the toman the operator sees", () => {
    expect(toFormAmount("18500000000", "IRR")).toBe(1_850_000_000);
    expect(fmtToman("18500000000")).toContain("۱٬۸۵۰٬۰۰۰٬۰۰۰");
  });

  it("hashes the rial amount, which is what the server will recompute", async () => {
    const fields = ["sourceAccount", "destinationAccount", "amount"];
    const typedInToman = "1500000";
    const payload = {
      sourceAccount: "0201234567001",
      destinationAccount: "5892101234567890",
      amount: String(toApiAmount(typedInToman, "IRR")),
    };
    expect(canonicalPayload("shahin.transfer", payload.destinationAccount, fields, payload))
      .toContain("amount=15000000");

    // And the hash for the toman figure is a different one — confirming the
    // wrong unit could not accidentally verify.
    const wrongUnit = { ...payload, amount: typedInToman };
    await expect(hashPayload("shahin.transfer", payload.destinationAccount, fields, payload))
      .resolves.not.toBe(await hashPayload("shahin.transfer", payload.destinationAccount, fields, wrongUnit));
  });

  it("binds the destination, so retyping the account invalidates the code", async () => {
    const fields = ["sourceAccount", "destinationAccount", "amount"];
    const a = { sourceAccount: "s", destinationAccount: "1111", amount: "15000000" };
    const b = { ...a, destinationAccount: "2222" };
    await expect(hashPayload("shahin.transfer", a.destinationAccount, fields, a))
      .resolves.not.toBe(await hashPayload("shahin.transfer", b.destinationAccount, fields, b));
  });

  it("filters a statement by the rial equivalent of a toman bound", () => {
    // The operator types 100,000 toman; the bank filter must see 1,000,000 rial.
    expect(String(toApiAmount("100000", "IRR"))).toBe("1000000");
  });
});
