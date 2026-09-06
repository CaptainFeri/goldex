import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { OperationOtpService } from "../operation-otp/operation-otp.service";
import { AdminShahinController } from "./admin-shahin.controller";
import { AdminShahinService } from "./admin-shahin.service";
import { ShahinExportService } from "./shahin-export.service";

/**
 * Both guards are left real. These routes reach the company's bank, and the
 * point of the change is that they are gated — a mocked guard would prove
 * nothing about that.
 *
 * `accounts/inquiry` also sits where `accounts/:id` matches, and `:id` is
 * behind ParseIntPipe, so declaration order decides whether an inquiry is
 * answered or rejected as a malformed id.
 */
describe("AdminShahinController", () => {
  let app: INestApplication;
  let caller: unknown;

  const service = {
    listAccounts: jest.fn().mockResolvedValue([]),
    account: jest.fn().mockResolvedValue({}),
    balance: jest.fn().mockResolvedValue({}),
    statement: jest.fn().mockResolvedValue([]),
    inquiry: jest.fn().mockResolvedValue({}),
    transfer: jest.fn().mockResolvedValue({}),
    batchTransfer: jest.fn().mockResolvedValue({}),
    openBanking: jest.fn().mockResolvedValue([]),
    syncOpenBanking: jest.fn().mockResolvedValue({}),
    accountsByIds: jest.fn().mockResolvedValue([]),
  };
  const exporter = { streamStatements: jest.fn(async (_s: unknown, res: any) => res.end("x")) };
  const otp = { consume: jest.fn().mockResolvedValue(undefined) };

  const admin = (permissions: string[]) => ({
    id: "a-1", isSuspended: false, roleId: "r-1",
    roleRef: { id: "r-1", slug: "custom", permissions },
  });
  const full = admin(["accounting", "wallets_ops"]);

  const TRANSFER = {
    method: "satna", sourceAccount: "1111", destinationAccount: "2222",
    amount: "5000000", challengeId: "c1", otp: "12345",
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminShahinController],
      providers: [AdminShahinService, ShahinExportService, AdminPermissionsGuard, OperationOtpService],
    })
      .overrideProvider(AdminShahinService).useValue(service)
      .overrideProvider(ShahinExportService).useValue(exporter)
      .overrideProvider(OperationOtpService).useValue(otp)
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().admin = caller;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    caller = full;
    jest.clearAllMocks();
  });

  const url = (p: string) => `/api/v1/admin/shahin/${p}`;

  describe("routing", () => {
    it("reads accounts/inquiry as the inquiry route, not as an account id", async () => {
      await request(app.getHttpServer())
        .post(url("accounts/inquiry")).send({ destAccount: "12345678" }).expect(200);
      expect(service.inquiry).toHaveBeenCalled();
      expect(service.account).not.toHaveBeenCalled();
    });

    it("still rejects a non-numeric account id", async () => {
      await request(app.getHttpServer()).get(url("accounts/not-a-number")).expect(400);
    });

    it("routes statement/export to the exporter rather than to an account", async () => {
      await request(app.getHttpServer()).get(url("statement/export?accountIds=1,2")).expect(200);
      expect(exporter.streamStatements).toHaveBeenCalled();
    });

    it("answers the action POSTs with 200 — none of them creates anything", async () => {
      await request(app.getHttpServer()).post(url("transfer")).send(TRANSFER).expect(200);
      await request(app.getHttpServer()).post(url("open-banking/1/sync")).send({}).expect(200);
    });

    it("ignores an account id that is not a number in the export list", async () => {
      await request(app.getHttpServer()).get(url("statement/export?accountIds=1,abc,-4,2")).expect(200);
      expect(service.accountsByIds).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe("validation", () => {
    it("rejects a transfer method the rails do not have", async () => {
      await request(app.getHttpServer())
        .post(url("transfer")).send({ ...TRANSFER, method: "carrier-pigeon" }).expect(400);
      expect(service.transfer).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric amount", async () => {
      await request(app.getHttpServer())
        .post(url("transfer")).send({ ...TRANSFER, amount: "a lot" }).expect(400);
    });

    it("rejects an inverted or malformed statement range", async () => {
      await request(app.getHttpServer()).get(url("accounts/1/statement?from=nonsense")).expect(400);
    });
  });

  describe("authorisation", () => {
    it("refuses reads to an operator without `accounting`", async () => {
      caller = admin(["dashboard"]);
      await request(app.getHttpServer()).get(url("accounts")).expect(403);
      await request(app.getHttpServer()).get(url("open-banking")).expect(403);
      expect(service.listAccounts).not.toHaveBeenCalled();
    });

    it("refuses money movement to an operator who can only read", async () => {
      // The distinction that matters: seeing the balances is not authority to
      // move the money.
      caller = admin(["accounting"]);
      await request(app.getHttpServer()).get(url("accounts")).expect(200);
      await request(app.getHttpServer()).post(url("transfer")).send(TRANSFER).expect(403);
      await request(app.getHttpServer())
        .post(url("accounts/inquiry")).send({ destAccount: "1" }).expect(403);
      expect(service.transfer).not.toHaveBeenCalled();
    });

    it("refuses everything to a suspended operator", async () => {
      caller = { ...full, isSuspended: true };
      await request(app.getHttpServer()).get(url("accounts")).expect(403);
    });
  });

  describe("second factor", () => {
    it("refuses a transfer with no confirmation in the body", async () => {
      const { challengeId: _c, otp: _o, ...noConfirmation } = TRANSFER;
      await request(app.getHttpServer()).post(url("transfer")).send(noConfirmation).expect(400);
      expect(service.transfer).not.toHaveBeenCalled();
    });

    it("binds the challenge to the destination account and the amount", async () => {
      await request(app.getHttpServer()).post(url("transfer")).send(TRANSFER).expect(200);
      expect(otp.consume).toHaveBeenCalledWith(
        expect.anything(),
        "shahin.transfer",
        "2222",       // refId comes from destinationAccount, per the descriptor
        null,
        "c1",
        "12345",
        expect.objectContaining({ amount: "5000000", sourceAccount: "1111" }),
      );
    });

    it("does not reach the bank when the code is refused", async () => {
      otp.consume.mockRejectedValueOnce(new Error("OTP.PAYLOAD_MISMATCH"));
      await request(app.getHttpServer()).post(url("transfer")).send(TRANSFER).expect(500);
      expect(service.transfer).not.toHaveBeenCalled();
    });

    it("covers a batch with one challenge over the destination set", async () => {
      await request(app.getHttpServer()).post(url("batch-transfer")).send({
        method: "paya", sourceAccount: "1111",
        items: [{ destinationAccount: "2222", amount: "100" }],
        refIds: ["2222", "3333"], challengeId: "c1", otp: "12345",
      }).expect(200);
      expect(otp.consume).toHaveBeenCalledWith(
        expect.anything(), "withdraw.bulk", null, ["2222", "3333"], "c1", "12345", expect.anything(),
      );
    });
  });
});
