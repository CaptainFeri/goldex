import { BadRequestException, INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { OperationOtpService } from "../operation-otp/operation-otp.service";
import { AdminEmController } from "./admin-em.controller";
import { AdminEmService } from "./admin-em.service";
import { P2pEmViewService } from "./p2p-em-view.service";

/**
 * Both guards are real. The split that matters is that watching the desk and
 * deciding on money are different permissions, and that a decision also needs
 * a second factor.
 */
describe("AdminEmController", () => {
  let app: INestApplication;
  let caller: unknown;

  const view = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    stats: jest.fn().mockResolvedValue({ total: 0 }),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const em = {
    assignAccount: jest.fn().mockResolvedValue(undefined),
    setEnclosure: jest.fn().mockResolvedValue(undefined),
    approve: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn().mockResolvedValue(undefined),
    receipt: jest.fn().mockResolvedValue({}),
  };
  const otp = { consume: jest.fn().mockResolvedValue(undefined) };

  const admin = (permissions: string[]) => ({
    id: "a-1", isSuspended: false, roleId: "r-1",
    roleRef: { id: "r-1", slug: "custom", permissions },
  });
  const full = admin(["withdrawals_view", "withdrawals_approve"]);
  // A well-formed v4: `@IsUUID()` checks the version and variant nibbles,
  // which the all-ones string fails even though ParseUUIDPipe accepts it.
  const UUID = "11111111-1111-4111-8111-111111111111";
  const DECISION = { note: "تایید شد", challengeId: "c1", otp: "12345" };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminEmController],
      providers: [P2pEmViewService, AdminEmService, AdminPermissionsGuard, OperationOtpService],
    })
      .overrideProvider(P2pEmViewService).useValue(view)
      .overrideProvider(AdminEmService).useValue(em)
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

  const url = (p: string) => `/api/v1/admin/em/${p}`;

  describe("routing and validation", () => {
    it("answers the list, stats and detail routes from their own handlers", async () => {
      await request(app.getHttpServer()).get(url("stats")).expect(200);
      expect(view.stats).toHaveBeenCalled();
      await request(app.getHttpServer()).get(url("requests")).expect(200);
      expect(view.list).toHaveBeenCalled();
      await request(app.getHttpServer()).get(url(`requests/${UUID}`)).expect(200);
      expect(view.findOne).toHaveBeenCalledWith(UUID);
    });

    it("rejects a status or type outside the projection's vocabulary", async () => {
      await request(app.getHttpServer()).get(url("requests?status=maybe")).expect(400);
      await request(app.getHttpServer()).get(url("requests?type=banana")).expect(400);
      await request(app.getHttpServer()).get(url("requests?searchBy=vibes")).expect(400);
    });

    it("passes the filters through", async () => {
      await request(app.getHttpServer())
        .get(url("requests?status=awaiting_receipt&searchBy=performer&q=0912&page=2")).expect(200);
      expect(view.list.mock.calls[0][0]).toMatchObject({
        status: "awaiting_receipt", searchBy: "performer", q: "0912", page: 2,
      });
    });

    it("answers the action routes with 200 — none of them creates anything", async () => {
      await request(app.getHttpServer())
        .post(url(`requests/${UUID}/account`)).send({ bankAccountId: UUID }).expect(200);
      await request(app.getHttpServer())
        .patch(url(`requests/${UUID}/enclosure`)).send({ hasEnclosure: true }).expect(200);
    });

    it("requires a note on a decision, since the audit log does", async () => {
      const { note: _n, ...noNote } = DECISION;
      await request(app.getHttpServer()).post(url(`requests/${UUID}/approve`)).send(noNote).expect(400);
      expect(em.approve).not.toHaveBeenCalled();
    });

    it("rejects a bank account id that is not a uuid", async () => {
      await request(app.getHttpServer())
        .post(url(`requests/${UUID}/account`)).send({ bankAccountId: "nope" }).expect(400);
    });
  });

  describe("authorisation", () => {
    it("refuses the desk to an operator without withdrawals_view", async () => {
      caller = admin(["dashboard"]);
      await request(app.getHttpServer()).get(url("requests")).expect(403);
      await request(app.getHttpServer()).get(url("stats")).expect(403);
      expect(view.list).not.toHaveBeenCalled();
    });

    it("lets a viewer watch the desk but not decide on it", async () => {
      caller = admin(["withdrawals_view"]);
      await request(app.getHttpServer()).get(url("requests")).expect(200);
      await request(app.getHttpServer()).post(url(`requests/${UUID}/approve`)).send(DECISION).expect(403);
      await request(app.getHttpServer())
        .post(url(`requests/${UUID}/account`)).send({ bankAccountId: UUID }).expect(403);
      expect(em.approve).not.toHaveBeenCalled();
    });

    it("refuses everything to a suspended operator", async () => {
      caller = { ...full, isSuspended: true };
      await request(app.getHttpServer()).get(url("requests")).expect(403);
    });
  });

  describe("second factor", () => {
    it("refuses a decision with no confirmation in the body", async () => {
      await request(app.getHttpServer())
        .post(url(`requests/${UUID}/approve`)).send({ note: "n" }).expect(400);
      expect(em.approve).not.toHaveBeenCalled();
    });

    it("binds the challenge to the request being decided", async () => {
      await request(app.getHttpServer()).post(url(`requests/${UUID}/approve`)).send(DECISION).expect(200);
      expect(otp.consume).toHaveBeenCalledWith(
        expect.anything(), "em.approve", UUID, null, "c1", "12345", expect.objectContaining({ note: "تایید شد" }),
      );
    });

    it("gates reject as well as approve", async () => {
      await request(app.getHttpServer()).post(url(`requests/${UUID}/reject`)).send(DECISION).expect(200);
      expect(otp.consume).toHaveBeenCalled();
    });

    it("does not act when the code is refused", async () => {
      otp.consume.mockRejectedValueOnce(new BadRequestException("OTP.INVALID"));
      await request(app.getHttpServer()).post(url(`requests/${UUID}/approve`)).send(DECISION).expect(400);
      expect(em.approve).not.toHaveBeenCalled();
    });

    it("leaves account assignment and the enclosure flag ungated", async () => {
      // Neither moves money: one names an account, the other is a display flag.
      await request(app.getHttpServer())
        .post(url(`requests/${UUID}/account`)).send({ bankAccountId: UUID }).expect(200);
      await request(app.getHttpServer())
        .patch(url(`requests/${UUID}/enclosure`)).send({ hasEnclosure: false }).expect(200);
      expect(otp.consume).not.toHaveBeenCalled();
    });
  });
});
