import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { SignedFileUrlService } from "./signed-file-url.service";

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const ADMIN_SECRET = { GOLDEX_AUTH_ADMIN_JWT_SECRET: "admin-secret" };

describe("SignedFileUrlService", () => {
  let service: SignedFileUrlService;

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    service = new SignedFileUrlService(config(ADMIN_SECRET));
  });

  afterEach(() => jest.restoreAllMocks());

  const tokenOf = (url: string) => url.slice(url.lastIndexOf("/") + 1);

  it("round-trips an object name", () => {
    const url = service.sign("licence-abc-2026-09-05.jpg");
    expect(url.startsWith("/api/v1/files/signed/")).toBe(true);
    expect(service.verify(tokenOf(url))).toBe("licence-abc-2026-09-05.jpg");
  });

  it("round-trips a nested key", () => {
    // Keys go in the path, so anything that survives a URL segment must work.
    const url = service.sign("kyc/42/national-card.jpg");
    expect(service.verify(tokenOf(url))).toBe("kyc/42/national-card.jpg");
  });

  it("rejects a token signed with a different secret", () => {
    const other = new SignedFileUrlService(config({ GOLDEX_AUTH_ADMIN_JWT_SECRET: "other" }));
    const forged = tokenOf(other.sign("kyc/42/national-card.jpg"));
    expect(() => service.verify(forged)).toThrow(ForbiddenException);
  });

  it("rejects a tampered object name", () => {
    // The whole point: naming a different object must not be possible without
    // the key, or this is no better than the unauthenticated route it replaces.
    const token = tokenOf(service.sign("deposit-aaaa-2026-09-05.jpg"));
    const [, signature] = token.split(".");
    const swapped = Buffer.from(
      JSON.stringify({ o: "kyc/42/national-card.jpg", e: 1_700_000_900 }),
    ).toString("base64url");
    expect(() => service.verify(`${swapped}.${signature}`)).toThrow(ForbiddenException);
  });

  it("rejects a token past its expiry", () => {
    const token = tokenOf(service.sign("deposit-aaaa-2026-09-05.jpg", 60));
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000 + 61_000);
    expect(() => service.verify(token)).toThrow(ForbiddenException);
  });

  it("accepts a token that has not quite expired", () => {
    const token = tokenOf(service.sign("deposit-aaaa-2026-09-05.jpg", 60));
    jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000 + 59_000);
    expect(service.verify(token)).toBe("deposit-aaaa-2026-09-05.jpg");
  });

  it.each([["no separator", "abcdef"], ["empty", ""], ["payload only", ".sig"], ["garbage", "!!.??"]])(
    "rejects a malformed token (%s)",
    (_label, token) => {
      expect(() => service.verify(token)).toThrow(ForbiddenException);
    },
  );

  it("gives every rejection the same message, so probing learns nothing", () => {
    const expired = tokenOf(service.sign("a.jpg", -1));
    const messages = ["garbage", expired].map((t) => {
      try {
        service.verify(t);
        return "accepted";
      } catch (err) {
        return (err as Error).message;
      }
    });
    expect(new Set(messages).size).toBe(1);
  });

  it("signs with a derived key, not the raw secret it falls back to", () => {
    // A file URL must never be forgeable by anyone holding the admin JWT
    // secret alone, nor replayable as a session token.
    const [payload, signature] = tokenOf(service.sign("a.jpg")).split(".");
    const rawKeyMac = createHmac("sha256", ADMIN_SECRET.GOLDEX_AUTH_ADMIN_JWT_SECRET)
      .update(payload)
      .digest("base64url");
    expect(signature).not.toBe(rawKeyMac);
  });

  it("refuses to start with no secret at all", () => {
    expect(() => new SignedFileUrlService(config({}))).toThrow(/GOLDEX_FILE_URL_SECRET/);
  });
});
