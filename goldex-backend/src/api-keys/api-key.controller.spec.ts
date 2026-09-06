import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyStatus } from "./entity/api-key.entity";

/**
 * Routing and enforcement over the real pipeline.
 *
 * `api/stats` and `api-keys` share the `admin` prefix with the roles
 * controller — three controllers now mount on it, and a path that shadowed
 * another would take routes away from whichever registered later.
 *
 * The permissions guard is left real: these endpoints mint credentials, so
 * "does an operator without `api` actually get refused" is the point.
 */
describe("ApiKeyController", () => {
  let app: INestApplication;
  let caller: unknown;

  const service = {
    stats: jest.fn().mockResolvedValue({ requestsToday: 0, keyedRouteCount: 0 }),
    traffic: jest.fn().mockResolvedValue({ points: [], keyedRouteCount: 0 }),
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "k-1", plaintextKey: "gx_live_x" }),
    updateStatus: jest.fn().mockResolvedValue({ id: "k-1" }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const admin = (permissions: string[]) => ({
    id: "a-1", isSuspended: false, roleId: "r-1",
    roleRef: { id: "r-1", slug: "custom", permissions },
  });
  const withApi = admin(["api"]);
  const UUID = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ApiKeyController],
      providers: [ApiKeyService, AdminPermissionsGuard],
    })
      .overrideProvider(ApiKeyService)
      .useValue(service)
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
    caller = withApi;
    jest.clearAllMocks();
  });

  const url = (p: string) => `/api/v1/admin/${p}`;

  describe("routing", () => {
    it("routes api/stats and api/traffic to their own handlers", async () => {
      await request(app.getHttpServer()).get(url("api/stats")).expect(200);
      expect(service.stats).toHaveBeenCalled();
      await request(app.getHttpServer()).get(url("api/traffic")).expect(200);
      expect(service.traffic).toHaveBeenCalledWith("24h");
    });

    it("passes a valid window through and rejects an unknown one", async () => {
      await request(app.getHttpServer()).get(url("api/traffic?window=7d")).expect(200);
      expect(service.traffic).toHaveBeenCalledWith("7d");
      await request(app.getHttpServer()).get(url("api/traffic?window=99y")).expect(400);
    });

    it("sends a status change to updateStatus and a delete to remove", async () => {
      await request(app.getHttpServer())
        .patch(url(`api-keys/${UUID}/status`))
        .send({ status: ApiKeyStatus.ACTIVE })
        .expect(200);
      expect(service.updateStatus).toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();

      await request(app.getHttpServer()).delete(url(`api-keys/${UUID}`)).expect(200);
      expect(service.remove).toHaveBeenCalledWith(UUID);
    });

    it("still rejects a non-UUID id with a 400", async () => {
      await request(app.getHttpServer()).delete(url("api-keys/not-a-uuid")).expect(400);
    });

    it("answers create with 201 and delete with 200", async () => {
      await request(app.getHttpServer()).post(url("api-keys")).send({ name: "Prod" }).expect(201);
      await request(app.getHttpServer()).delete(url(`api-keys/${UUID}`)).expect(200);
    });

    it("rejects a status outside the enum", async () => {
      await request(app.getHttpServer())
        .patch(url(`api-keys/${UUID}/status`))
        .send({ status: "banana" })
        .expect(400);
      expect(service.updateStatus).not.toHaveBeenCalled();
    });

    it("requires a name when creating", async () => {
      await request(app.getHttpServer()).post(url("api-keys")).send({}).expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe("enforcement", () => {
    it("refuses every route to an operator without `api`", async () => {
      caller = admin(["dashboard", "roles_manage"]);
      for (const [method, path] of [
        ["get", "api/stats"], ["get", "api/traffic"], ["get", "api-keys"],
      ] as const) {
        await request(app.getHttpServer())[method](url(path)).expect(403);
      }
      await request(app.getHttpServer()).post(url("api-keys")).send({ name: "x" }).expect(403);
      expect(service.create).not.toHaveBeenCalled();
    });

    it("refuses a suspended operator who holds `api`", async () => {
      caller = { ...withApi, isSuspended: true };
      await request(app.getHttpServer()).get(url("api-keys")).expect(403);
    });

    it("returns the plaintext key exactly once, on create", async () => {
      const res = await request(app.getHttpServer()).post(url("api-keys")).send({ name: "Prod" }).expect(201);
      expect(res.body.data.plaintextKey).toBe("gx_live_x");
      const list = await request(app.getHttpServer()).get(url("api-keys")).expect(200);
      expect(JSON.stringify(list.body)).not.toContain("gx_live_x");
    });
  });
});
