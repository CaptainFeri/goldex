import { describe, expect, it } from "vitest";
import { canonicalPayload, canonicalValue, hashPayload, refKeyOf } from "./operation-otp";

/**
 * Cross-implementation contract.
 *
 * Every `canonical` and `hash` below was produced by the *server's*
 * `payload-hash.ts`, not by this file. If the two implementations drift, these
 * fail here rather than as an unexplained OTP.PAYLOAD_MISMATCH in production
 * that looks to an operator like the code simply did not work.
 */
const VECTORS = [
  {
    scope: "accounting.voucher", ref: "v-1", fields: ["note"],
    payload: { note: "تایید شد" },
    canonical: "accounting.voucher|v-1|note=تایید شد",
    hash: "ae2b37682e85ba16d3e9672e3649b133aa06bc915a543105344c56219cbf81eb",
  },
  {
    scope: "accounting.voucher", ref: "v-1", fields: ["note"],
    payload: {},
    canonical: "accounting.voucher|v-1|note=",
    hash: "82f1d7548e3e903aa01180548cf824a4093f9ae1b3b42ea1497567f7e1a39f90",
  },
  {
    scope: "wallet.deposit", ref: "w1",
    fields: ["walletId", "actionType", "transactionType", "amount"],
    payload: { walletId: "w1", actionType: "increase", transactionType: "DEPOSIT", amount: "5000000.00" },
    canonical: "wallet.deposit|w1|walletId=w1|actionType=increase|transactionType=DEPOSIT|amount=5000000",
    hash: "1c348ffbdfa7994cb1da844c7f06387c9b37dbcd197c53643864cf311db68168",
  },
  {
    scope: "wallet.deposit", ref: "w1",
    fields: ["walletId", "actionType", "transactionType", "amount"],
    payload: { walletId: "w1", actionType: "increase", transactionType: "DEPOSIT", amount: 5000000 },
    canonical: "wallet.deposit|w1|walletId=w1|actionType=increase|transactionType=DEPOSIT|amount=5000000",
    hash: "1c348ffbdfa7994cb1da844c7f06387c9b37dbcd197c53643864cf311db68168",
  },
  {
    scope: "withdraw.bulk", ref: "bulk:1eb7c54d52831bbfe8942af0b1c56b74", fields: ["action"],
    payload: { action: "approve" },
    canonical: "withdraw.bulk|bulk:1eb7c54d52831bbfe8942af0b1c56b74|action=approve",
    hash: "24c838ccee6cf9fee70b86ee1d432542d9c197483fc32a909ab915d8efdb6ecf",
  },
  {
    scope: "shahin.transfer", ref: "acc-2",
    fields: ["sourceAccount", "destinationAccount", "amount"],
    payload: { sourceAccount: "acc-1", destinationAccount: "acc-2", amount: "1.500" },
    canonical: "shahin.transfer|acc-2|sourceAccount=acc-1|destinationAccount=acc-2|amount=1.5",
    hash: "4980231d1d7b3729dcbd9668bd4cf4ea957c37813c5f34a2607082b414fd803d",
  },
];

describe("payload hashing agrees with the server", () => {
  it.each(VECTORS)("canonicalises $scope the same way", ({ scope, ref, fields, payload, canonical }) => {
    expect(canonicalPayload(scope, ref, fields, payload)).toBe(canonical);
  });

  it.each(VECTORS)("hashes $scope to the server's digest", async ({ scope, ref, fields, payload, hash }) => {
    await expect(hashPayload(scope, ref, fields, payload)).resolves.toBe(hash);
  });
});

describe("refKeyOf agrees with the server", () => {
  it("derives the server's bulk key for the same set, in any order", async () => {
    await expect(refKeyOf(null, ["b", "a"])).resolves.toBe("bulk:1eb7c54d52831bbfe8942af0b1c56b74");
    await expect(refKeyOf(null, ["a", "b"])).resolves.toBe("bulk:1eb7c54d52831bbfe8942af0b1c56b74");
  });

  it("passes a single reference straight through", async () => {
    await expect(refKeyOf("v-1")).resolves.toBe("v-1");
    await expect(refKeyOf()).resolves.toBe("-");
  });
});

describe("canonicalValue", () => {
  it("collapses every spelling of the same amount", () => {
    const forms = [5000000, "5000000", "5000000.00", "+5000000", "05000000", "5e6", " 5000000 "];
    expect(new Set(forms.map(canonicalValue)).size).toBe(1);
  });

  it("keeps genuinely different amounts apart", () => {
    expect(canonicalValue("5000000")).not.toBe(canonicalValue("500000000"));
  });

  it("does not lose precision on large rial amounts", () => {
    expect(canonicalValue("900719925474099123")).toBe("900719925474099123");
    expect(canonicalValue("9.00719925474099123e17")).toBe("900719925474099123");
  });

  it("distinguishes absent from zero", () => {
    expect(canonicalValue(0)).not.toBe(canonicalValue(null));
  });
});
