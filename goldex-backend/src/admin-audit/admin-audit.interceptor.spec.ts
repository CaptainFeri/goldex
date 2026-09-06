import { BadRequestException, Controller, INestApplication, Post, Get, Patch, Body, Param, ValidationPipe, VersioningType } from "@nestjs/common";
import { APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuditInterceptor } from "./admin-audit.interceptor";
import { AdminAuditService } from "./admin-audit.service";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { SkipAudit } from "./audit.decorators";
import { REDACTED } from "./redact";

/** Stand-ins for the real admin controllers, over the real pipeline. */
@Controller("admin/things")
class ThingsController {
  @Get()
  list() {
    return { data: [] };
  }

  @Post(":id/finalize")
  @RequirePermissions("accounting")
  finalize(@Param("id") _id: string, @Body() _b: unknown) {
    return { data: null };
  }

  @Patch(":id")
  patch(@Param("id") _id: string, @Body() _b: unknown) {
    return { data: null };
  }

  @Post("boom")
  boom() {
    throw new BadRequestException("OTP.INVALID");
  }

  @Post("quiet")
  @SkipAudit()
  quiet() {
    return { data: null };
  }
}

@Controller("public/things")
class PublicController {
  @Post()
  create() {
    return { data: null };
  }
}

describe("AdminAuditInterceptor", () => {
  let app: INestApplication;
  const record = jest.fn().mockResolvedValue(undefined);
  const admin = { id: "a-1", fullName: "علی رضایی", phone: "09120000001" };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController, PublicController],
      providers: [
        Reflector,
        { provide: AdminAuditService, useValue: { record } },
        { provide: APP_INTERCEPTOR, useClass: AdminAuditInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    // The auth middleware normally does this; the interceptor just reads it.
    app.use((req: any, _res: unknown, nextFn: () => void) => {
      req.admin = admin;
      nextFn();
    });
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const url = (p: string) => `/api/v1/admin/things${p}`;
  const entry = () => record.mock.calls[0][0];

  it("records a mutation without the controller opting in", async () => {
    // Coverage is the point: an audit trail you have to remember to add
    // records exactly the routes someone remembered.
    await request(app.getHttpServer()).patch(url("/t-1")).send({ note: "hi" }).expect(200);
    expect(record).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({
      action: "PATCH /admin/things/:id",
      entity: "things",
      entityId: "t-1",
      adminId: "a-1",
      adminLabel: "علی رضایی",
    });
  });

  it("ignores reads", async () => {
    await request(app.getHttpServer()).get(url("")).expect(200);
    expect(record).not.toHaveBeenCalled();
  });

  it("ignores non-admin routes", async () => {
    await request(app.getHttpServer()).post("/api/v1/public/things").send({}).expect(201);
    expect(record).not.toHaveBeenCalled();
  });

  it("never writes a credential into the log", async () => {
    await request(app.getHttpServer())
      .post(url("/t-1/finalize"))
      .send({ note: "ok", amount: "5000000", otp: "12345", challengeId: "c-1", password: "hunter2" })
      .expect(201);

    const e = entry();
    expect(e.after.otp).toBe(REDACTED);
    expect(e.after.password).toBe(REDACTED);
    // What changed survives; only the secrets go.
    expect(e.after.amount).toBe("5000000");
    expect(e.after.note).toBe("ok");
    expect(JSON.stringify(e)).not.toContain("12345");
    expect(JSON.stringify(e)).not.toContain("hunter2");
  });

  it("lifts the challenge id into its own column", async () => {
    await request(app.getHttpServer())
      .post(url("/t-1/finalize")).send({ challengeId: "c-9", otp: "1" }).expect(201);
    expect(entry().otpChallengeId).toBe("c-9");
  });

  it("records the permission the route demanded", async () => {
    await request(app.getHttpServer()).post(url("/t-1/finalize")).send({}).expect(201);
    expect(entry().permission).toBe("accounting");
  });

  it("records refusals, not just successes", async () => {
    // "Who tried this and was told no" is usually the more interesting question.
    await request(app.getHttpServer()).post(url("/boom")).send({ amount: "1" }).expect(400);
    expect(record).toHaveBeenCalledTimes(1);
    expect(entry()).toMatchObject({ statusCode: 400, errorMessage: "OTP.INVALID" });
  });

  it("honours an explicit skip", async () => {
    await request(app.getHttpServer()).post(url("/quiet")).send({}).expect(201);
    expect(record).not.toHaveBeenCalled();
  });

  it("captures the caller's ip, agent and the call's duration", async () => {
    await request(app.getHttpServer())
      .patch(url("/t-1")).set("user-agent", "jest-agent").send({}).expect(200);
    const e = entry();
    expect(e.userAgent).toBe("jest-agent");
    expect(e.ip).toBeTruthy();
    expect(typeof e.durationMs).toBe("number");
  });

  it("leaves `before` null unless a handler recorded one", async () => {
    await request(app.getHttpServer()).patch(url("/t-1")).send({}).expect(200);
    // An interceptor cannot know the prior state, and a guessed "before" in the
    // record that settles a dispute is worse than an absent one.
    expect(entry().before).toBeNull();
  });
});

describe("AdminAuditService.record", () => {
  it("swallows a write failure rather than failing the operation it records", async () => {
    const { AdminAuditService: Svc } = await import("./admin-audit.service");
    const repo = {
      create: jest.fn((v) => v),
      insert: jest.fn().mockRejectedValue(new Error("db down")),
    };
    const svc = new Svc(repo as any);
    // An operator retrying a refused transfer because the audit insert timed
    // out is worse than a gap in the log.
    await expect(svc.record({ action: "x" } as any)).resolves.toBeUndefined();
  });
});
