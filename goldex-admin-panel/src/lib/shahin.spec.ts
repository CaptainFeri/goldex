import { describe, expect, it } from "vitest";
import { toApiAmount, toFormAmount, fmtToman } from "./money";
import { canonicalPayload, hashPayload } from "./operation-otp";

/**
 * The transfer form and the wire both carry rial, so the amount must reach the
 * hash unrescaled: the OTP is bound to whatever the panel computed, and a
 * figure altered after the fact would still confirm.
 */
describe("shahin transfer amounts", () => {
  it("sends the typed rial amount as-is", () => {
    expect(toApiAmount("1500000", "IRR")).toBe(1_500_000);
  });

  it("round-trips a rial figure back into the form the operator sees", () => {
    expect(toFormAmount("18500000000", "IRR")).toBe(18_500_000_000);
    expect(fmtToman("18500000000")).toContain("۱۸٬۵۰۰٬۰۰۰٬۰۰۰");
  });

  it("hashes the rial amount, which is what the server will recompute", async () => {
    const fields = ["sourceAccount", "destinationAccount", "amount"];
    const typed = "1500000";
    const payload = {
      sourceAccount: "0201234567001",
      destinationAccount: "5892101234567890",
      amount: String(toApiAmount(typed, "IRR")),
    };
    expect(canonicalPayload("shahin.transfer", payload.destinationAccount, fields, payload))
      .toContain("amount=1500000");

    // A different figure hashes differently, so an amount changed after the
    // code was issued cannot verify.
    const tampered = { ...payload, amount: "15000000" };
    await expect(hashPayload("shahin.transfer", payload.destinationAccount, fields, payload))
      .resolves.not.toBe(await hashPayload("shahin.transfer", payload.destinationAccount, fields, tampered));
  });

  it("binds the destination, so retyping the account invalidates the code", async () => {
    const fields = ["sourceAccount", "destinationAccount", "amount"];
    const a = { sourceAccount: "s", destinationAccount: "1111", amount: "15000000" };
    const b = { ...a, destinationAccount: "2222" };
    await expect(hashPayload("shahin.transfer", a.destinationAccount, fields, a))
      .resolves.not.toBe(await hashPayload("shahin.transfer", b.destinationAccount, fields, b));
  });

  it("filters a statement by the rial bound the operator typed", () => {
    expect(String(toApiAmount("100000", "IRR"))).toBe("100000");
  });
});
