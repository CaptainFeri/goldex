import { BadRequestException, ForbiddenException } from "@nestjs/common";
import Redis from "ioredis";
import { OperationOtpService, maskPhone } from "./operation-otp.service";
import { OtpScope, OTP_MAX_ATTEMPTS } from "./operation-otp.enums";
import { descriptorFor } from "./otp-scopes";
import { hashPayload, refKeyOf } from "./payload-hash";

/**
 * Against a real Redis, because the guarantees here are Redis guarantees:
 * `HINCRBY` is what makes the attempt limit hold under concurrency, and the
 * key's TTL is what "one live challenge" means. A fake would assert the shape
 * of the fake.
 *
 *   GOLDEX_REDIS_SPECS=1 npx jest src/operation-otp/operation-otp.service.spec.ts
 */
const ENABLED = process.env.GOLDEX_REDIS_SPECS === "1";
const describeRedis = ENABLED ? describe : describe.skip;

const ADMIN = { id: "admin-1", phone: "09120000001" } as any;
const SCOPE = OtpScope.WALLET_DEPOSIT;
const PAYLOAD = { walletId: "w1", actionType: "increase", transactionType: "DEPOSIT", amount: "5000000" };

const hashOf = (payload: Record<string, unknown>, refId = "w1") =>
  hashPayload(SCOPE, refKeyOf(refId), descriptorFor(SCOPE).fields, payload);

describeRedis("OperationOtpService", () => {
  let client: Redis;
  let service: OperationOtpService;
  let sent: string[];

  beforeAll(() => {
    client = new Redis({ host: process.env.REDIS_HOST ?? "127.0.0.1", port: Number(process.env.REDIS_PORT ?? 6379) });
  });
  afterAll(async () => {
    await client.quit();
  });

  beforeEach(async () => {
    const keys = await client.keys("op_otp:*");
    if (keys.length) await client.del(...keys);
    sent = [];
    const sms = {
      sendOTP: jest.fn(async (_to: string, code: string) => {
        sent.push(code);
        return { success: true };
      }),
    };
    service = new OperationOtpService({ getClient: () => client } as any, sms as any);
  });

  const issue = (payload = PAYLOAD, refId = "w1") =>
    service.issue(ADMIN, { scope: SCOPE, refId, payloadHash: hashOf(payload, refId) } as any);

  it("issues a challenge and texts the code to the admin's own phone", async () => {
    const c = await issue();
    expect(c.challengeId).toMatch(/^[0-9a-f]{32}$/);
    expect(c.expiresIn).toBe(60);
    expect(c.maskedPhone).toBe("0912***0001");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/^\d{5}$/);
  });

  it("never returns the code itself", async () => {
    const c = await issue();
    expect(JSON.stringify(c)).not.toContain(sent[0]);
  });

  it("stores only a hash of the code", async () => {
    await issue();
    const [key] = await client.keys("op_otp:*");
    const stored = await client.hgetall(key);
    expect(stored.codeHash).not.toBe(sent[0]);
    expect(stored.codeHash.startsWith("$2")).toBe(true);
  });

  it("expires the challenge after a minute", async () => {
    await issue();
    const [key] = await client.keys("op_otp:*");
    const ttl = await client.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("refuses a second challenge while one is alive, and says how long is left", async () => {
    await issue();
    await expect(issue()).rejects.toThrow(/OTP\.ALREADY_SENT:\d+/);
    expect(sent).toHaveLength(1);
  });

  it("allows a separate challenge for a different record at the same time", async () => {
    await issue(PAYLOAD, "w1");
    await expect(issue({ ...PAYLOAD, walletId: "w2" }, "w2")).resolves.toBeDefined();
    expect(sent).toHaveLength(2);
  });

  it("accepts the right code once and refuses it the second time", async () => {
    const c = await issue();
    await service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], PAYLOAD);
    // Single use: a replay of the same successful confirmation must fail.
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], PAYLOAD),
    ).rejects.toThrow(/OTP\.EXPIRED/);
  });

  it("refuses a code issued for a different amount", async () => {
    // The whole point: a code approved for 5,000,000 cannot move 500,000,000.
    const c = await issue();
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], { ...PAYLOAD, amount: "500000000" }),
    ).rejects.toThrow(/OTP\.PAYLOAD_MISMATCH/);
  });

  it("accepts the same amount written differently", async () => {
    // An honest client whose JSON says "5000000.00" must not be rejected.
    const c = await issue();
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], { ...PAYLOAD, amount: 5_000_000 }),
    ).resolves.toBeUndefined();
  });

  it("refuses a challenge id that belongs to another challenge", async () => {
    const c = await issue();
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, "not-the-id", sent[0], PAYLOAD),
    ).rejects.toThrow(/OTP\.CHALLENGE_MISMATCH/);
  });

  it("cannot be spent against a different record", async () => {
    const c = await issue();
    // Derives a different key, so there is simply no challenge there.
    await expect(
      service.consume(ADMIN, SCOPE, "w2", null, c.challengeId, sent[0], PAYLOAD),
    ).rejects.toThrow(/OTP\.EXPIRED/);
  });

  it("cannot be spent by a different admin", async () => {
    const c = await issue();
    const other = { id: "admin-2", phone: "09120000002" } as any;
    await expect(
      service.consume(other, SCOPE, "w1", null, c.challengeId, sent[0], PAYLOAD),
    ).rejects.toThrow(/OTP\.EXPIRED/);
  });

  it("destroys the challenge after three wrong codes", async () => {
    const c = await issue();
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(
        service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, "00000", PAYLOAD),
      ).rejects.toThrow(/OTP\.INVALID/);
    }
    // The fourth attempt trips the limit, and even the correct code is gone.
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], PAYLOAD),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await client.keys("op_otp:*")).toHaveLength(0);
  });

  it("counts a payload mismatch as an attempt", async () => {
    // Otherwise the amount could be probed without limit.
    const c = await issue();
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(
        service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], { ...PAYLOAD, amount: String(i) }),
      ).rejects.toThrow(/OTP\.PAYLOAD_MISMATCH/);
    }
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, sent[0], PAYLOAD),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("holds the attempt limit under concurrent guesses", async () => {
    // HINCRBY is what makes this true; a read-modify-write would let all ten
    // see "attempts = 0".
    const c = await issue();
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, "00000", PAYLOAD),
      ),
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const tooMany = results.filter(
      (r) => r.status === "rejected" && /TOO_MANY_ATTEMPTS/.test(String((r as PromiseRejectedResult).reason?.message)),
    );
    expect(tooMany.length).toBeGreaterThan(0);
    expect(await client.keys("op_otp:*")).toHaveLength(0);
  });

  it("does not leave a challenge behind when the SMS fails", async () => {
    const sms = { sendOTP: jest.fn(async () => ({ success: false })) };
    const failing = new OperationOtpService({ getClient: () => client } as any, sms as any);
    await expect(
      failing.issue(ADMIN, { scope: SCOPE, refId: "w1", payloadHash: hashOf(PAYLOAD) } as any),
    ).rejects.toThrow(/SMS\.SEND_FAILED/);
    // Otherwise the operator waits out a full minute for a code that never came.
    expect(await client.keys("op_otp:*")).toHaveLength(0);
  });

  it("refuses to issue for an admin with no phone on file", async () => {
    await expect(
      service.issue({ id: "a-9", phone: null } as any, { scope: SCOPE, refId: "w1", payloadHash: hashOf(PAYLOAD) } as any),
    ).rejects.toThrow(/OTP\.NO_PHONE_ON_FILE/);
  });

  it("requires a reference for a scoped operation and a set for a bulk one", async () => {
    await expect(
      service.issue(ADMIN, { scope: SCOPE, payloadHash: hashOf(PAYLOAD) } as any),
    ).rejects.toThrow(/OTP\.REF_ID_REQUIRED/);
    await expect(
      service.issue(ADMIN, { scope: OtpScope.WITHDRAW_BULK, payloadHash: hashOf(PAYLOAD) } as any),
    ).rejects.toThrow(/OTP\.REF_IDS_REQUIRED/);
  });

  it("covers a bulk set with one challenge, whatever order the ids arrive in", async () => {
    const fields = descriptorFor(OtpScope.WITHDRAW_BULK).fields;
    const ids = ["b", "a", "c"];
    const payload = { action: "approve" };
    const c = await service.issue(ADMIN, {
      scope: OtpScope.WITHDRAW_BULK,
      refIds: ids,
      payloadHash: hashPayload(OtpScope.WITHDRAW_BULK, refKeyOf(null, ids), fields, payload),
    } as any);
    await expect(
      service.consume(ADMIN, OtpScope.WITHDRAW_BULK, null, ["c", "a", "b"], c.challengeId, sent[0], payload),
    ).resolves.toBeUndefined();
  });

  it("refuses a bulk challenge spent on a different set", async () => {
    const fields = descriptorFor(OtpScope.WITHDRAW_BULK).fields;
    const payload = { action: "approve" };
    const c = await service.issue(ADMIN, {
      scope: OtpScope.WITHDRAW_BULK,
      refIds: ["a", "b"],
      payloadHash: hashPayload(OtpScope.WITHDRAW_BULK, refKeyOf(null, ["a", "b"]), fields, payload),
    } as any);
    // Adding a third withdrawal to the batch must invalidate the code.
    await expect(
      service.consume(ADMIN, OtpScope.WITHDRAW_BULK, null, ["a", "b", "c"], c.challengeId, sent[0], payload),
    ).rejects.toThrow(/OTP\.EXPIRED/);
  });

  it("rejects the dev bypass unless it is explicitly switched on", async () => {
    const c = await issue();
    const prev = process.env.GOLDEX_OTP_DEV_BYPASS;
    delete process.env.GOLDEX_OTP_DEV_BYPASS;
    await expect(
      service.consume(ADMIN, SCOPE, "w1", null, c.challengeId, "12345", PAYLOAD),
    ).rejects.toBeInstanceOf(BadRequestException);
    if (prev !== undefined) process.env.GOLDEX_OTP_DEV_BYPASS = prev;
  });
});

describe("maskPhone", () => {
  it("keeps enough to recognise and hides the rest", () => {
    expect(maskPhone("09120000001")).toBe("0912***0001");
  });

  it("does not leak a short number by returning it whole", () => {
    expect(maskPhone("12345")).toBe("***");
  });
});
