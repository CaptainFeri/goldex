import { REDACTED, redact, redactBody } from "./redact";

/**
 * The audit log stores request bodies, and those bodies carry live secrets.
 * These tests are the boundary between "a record of what happened" and "a
 * durable copy of every OTP and password the system has seen".
 */
describe("redact", () => {
  it("removes the credential fields that actually appear in these bodies", () => {
    const body = {
      otp: "12345",
      challengeId: "c-1",
      password: "hunter2",
      hashPassword: "$2b$10$abc",
      accessToken: "jwt...",
      refreshToken: "jwt...",
      apiKey: "gx_live_abc",
      api_key: "gx_live_abc",
      plaintextKey: "gx_live_abc",
      clientSecret: "s3cret",
      authorization: "Bearer x",
    };
    const out = redact(body) as Record<string, unknown>;
    for (const k of Object.keys(body)) {
      if (k === "challengeId") continue;
      expect(out[k]).toBe(REDACTED);
    }
  });

  it("keeps the challenge id — it identifies the confirmation, it is not the code", () => {
    expect((redact({ challengeId: "c-1" }) as any).challengeId).toBe("c-1");
  });

  it("keeps the fields a dispute actually turns on", () => {
    // Over-redaction is the other failure: a log that cannot say what changed.
    const out = redact({
      amount: "5000000",
      destinationAccount: "IR8205401",
      note: "تایید شد",
      hasEnclosure: true,
      bankAccountId: "acc-1",
    }) as Record<string, unknown>;
    expect(out).toEqual({
      amount: "5000000",
      destinationAccount: "IR8205401",
      note: "تایید شد",
      hasEnclosure: true,
      bankAccountId: "acc-1",
    });
  });

  it("matches on the key however it is spelled", () => {
    const out = redact({ OTP: "1", otpCode: "1", userPassword: "1", API_KEY: "1" }) as Record<string, unknown>;
    expect(Object.values(out).every((v) => v === REDACTED)).toBe(true);
  });

  it("redacts a secret nested anywhere", () => {
    const out = redact({ outer: { inner: { otp: "12345", amount: "1" } } }) as any;
    expect(out.outer.inner.otp).toBe(REDACTED);
    expect(out.outer.inner.amount).toBe("1");
  });

  it("redacts a secret-named object whole rather than walking into it", () => {
    const out = redact({ credentials: { user: "a", pass: "b" } }) as any;
    expect(out.credentials).toBe(REDACTED);
  });

  it("redacts inside arrays too", () => {
    const out = redact({ items: [{ otp: "1", amount: "2" }] }) as any;
    expect(out.items[0].otp).toBe(REDACTED);
    expect(out.items[0].amount).toBe("2");
  });

  it("caps a long string rather than storing it whole", () => {
    const out = redact({ note: "x".repeat(5000) }) as any;
    expect(out.note.length).toBeLessThan(2100);
    expect(out.note.endsWith("[truncated]")).toBe(true);
  });

  it("caps a long array and says how many were dropped", () => {
    const out = redact({ items: Array.from({ length: 120 }, (_, i) => i) }) as any;
    expect(out.items).toHaveLength(51);
    expect(String(out.items.at(-1))).toContain("70 more");
  });

  it("stops at a depth limit instead of following a deep or cyclic shape", () => {
    let deep: any = { amount: "1" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => redact(deep)).not.toThrow();
    expect(JSON.stringify(redact(deep))).toContain("depth limit");
  });

  it("survives a cycle without hanging", () => {
    const a: any = { name: "a" };
    a.self = a;
    expect(() => JSON.stringify(redact(a))).not.toThrow();
  });

  it("renders dates as text rather than walking them", () => {
    const out = redact({ at: new Date("2026-09-06T12:00:00Z") }) as any;
    expect(out.at).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("redactBody", () => {
  it("returns null for an empty body", () => {
    expect(redactBody(undefined)).toBeNull();
    expect(redactBody(null)).toBeNull();
  });

  it("wraps a non-object body so the column shape stays consistent", () => {
    expect(redactBody("plain")).toEqual({ value: "plain" });
    expect(redactBody([1, 2])).toEqual({ value: [1, 2] });
  });
});
