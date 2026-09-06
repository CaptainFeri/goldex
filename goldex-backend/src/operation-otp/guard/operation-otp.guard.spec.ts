import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OperationOtpGuard } from "./operation-otp.guard";
import { RequireOperationOtp } from "./require-otp.decorator";
import { OtpScope } from "../operation-otp.enums";

/**
 * Real decorators read through a real Reflector, so the metadata key the
 * decorator writes and the one the guard reads cannot drift apart — the exact
 * defect that made the old admin roles guard authorise nothing.
 */
class Handlers {
  @RequireOperationOtp(OtpScope.ACCOUNTING_VOUCHER)
  finalize() {}

  @RequireOperationOtp(OtpScope.WALLET_DEPOSIT)
  deposit() {}

  @RequireOperationOtp(OtpScope.WITHDRAW_BULK)
  bulk() {}

  ungated() {}
}

const ctx = (handler: unknown, request: Record<string, unknown>): any => ({
  switchToHttp: () => ({ getRequest: () => request }),
  getHandler: () => handler,
  getClass: () => Handlers,
});

const ADMIN = { id: "a-1" };

describe("OperationOtpGuard", () => {
  let consume: jest.Mock;
  let guard: OperationOtpGuard;

  beforeEach(() => {
    consume = jest.fn().mockResolvedValue(undefined);
    guard = new OperationOtpGuard(new Reflector(), { consume } as any);
  });

  it("lets an ungated handler through untouched", async () => {
    await expect(guard.canActivate(ctx(Handlers.prototype.ungated, {}))).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it("is a 401 when no admin is attached", async () => {
    await expect(
      guard.canActivate(ctx(Handlers.prototype.finalize, { body: { challengeId: "c", otp: "1" } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a request with no confirmation in the body", async () => {
    await expect(
      guard.canActivate(ctx(Handlers.prototype.finalize, { admin: ADMIN, body: {} })),
    ).rejects.toThrow(/OTP\.CONFIRMATION_REQUIRED/);
    expect(consume).not.toHaveBeenCalled();
  });

  it("refuses a confirmation whose fields are not strings", async () => {
    // `{ otp: { toString: ... } }` must not reach bcrypt.
    await expect(
      guard.canActivate(ctx(Handlers.prototype.finalize, { admin: ADMIN, body: { challengeId: "c", otp: 12345 } })),
    ).rejects.toThrow(/OTP\.CONFIRMATION_REQUIRED/);
  });

  it("takes the reference from the path when the descriptor says so", async () => {
    await guard.canActivate(
      ctx(Handlers.prototype.finalize, {
        admin: ADMIN,
        params: { id: "v-1" },
        // A body key of the same name must not win over the path.
        body: { challengeId: "c", otp: "1", id: "v-999" },
      }),
    );
    expect(consume).toHaveBeenCalledWith(
      ADMIN, OtpScope.ACCOUNTING_VOUCHER, "v-1", null, "c", "1", expect.anything(),
    );
  });

  it("takes the reference from the body when the descriptor says so", async () => {
    await guard.canActivate(
      ctx(Handlers.prototype.deposit, {
        admin: ADMIN,
        params: {},
        body: { challengeId: "c", otp: "1", walletId: "w-1", amount: "5000000" },
      }),
    );
    expect(consume).toHaveBeenCalledWith(
      ADMIN, OtpScope.WALLET_DEPOSIT, "w-1", null, "c", "1", expect.objectContaining({ walletId: "w-1" }),
    );
  });

  it("refuses when the reference the descriptor needs is missing", async () => {
    await expect(
      guard.canActivate(ctx(Handlers.prototype.deposit, { admin: ADMIN, params: {}, body: { challengeId: "c", otp: "1" } })),
    ).rejects.toThrow(/OTP\.REF_ID_REQUIRED/);
  });

  it("passes a bulk set through, accepting either refIds or ids", async () => {
    await guard.canActivate(
      ctx(Handlers.prototype.bulk, { admin: ADMIN, body: { challengeId: "c", otp: "1", refIds: ["a", "b"] } }),
    );
    expect(consume).toHaveBeenCalledWith(ADMIN, OtpScope.WITHDRAW_BULK, null, ["a", "b"], "c", "1", expect.anything());

    consume.mockClear();
    await guard.canActivate(
      ctx(Handlers.prototype.bulk, { admin: ADMIN, body: { challengeId: "c", otp: "1", ids: ["x"] } }),
    );
    expect(consume).toHaveBeenCalledWith(ADMIN, OtpScope.WITHDRAW_BULK, null, ["x"], "c", "1", expect.anything());
  });

  it("refuses a bulk request with an empty set", async () => {
    await expect(
      guard.canActivate(ctx(Handlers.prototype.bulk, { admin: ADMIN, body: { challengeId: "c", otp: "1", refIds: [] } })),
    ).rejects.toThrow(/OTP\.REF_IDS_REQUIRED/);
  });

  it("hands the request body to the service as the payload, not anything the client asserts", async () => {
    await guard.canActivate(
      ctx(Handlers.prototype.deposit, {
        admin: ADMIN,
        body: { challengeId: "c", otp: "1", walletId: "w-1", amount: "5000000", payloadHash: "deadbeef" },
      }),
    );
    const payload = consume.mock.calls[0][6];
    expect(payload.amount).toBe("5000000");
  });

  it("does not swallow the service's refusal", async () => {
    consume.mockRejectedValueOnce(new BadRequestException("OTP.PAYLOAD_MISMATCH"));
    await expect(
      guard.canActivate(ctx(Handlers.prototype.finalize, { admin: ADMIN, params: { id: "v" }, body: { challengeId: "c", otp: "1" } })),
    ).rejects.toThrow(/OTP\.PAYLOAD_MISMATCH/);
  });
});
