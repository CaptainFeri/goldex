import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoleController } from "./admin-role.controller";
import { AdminRoleService } from "./admin-role.service";
import { AdminPermissionsGuard } from "./guard/admin-permissions.guard";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "./permission.catalog";

/**
 * Two things over the real pipeline.
 *
 * Routing: `roles/stats` is a literal segment sitting where `roles/:id` also
 * matches, and `:id` is behind a ParseUUIDPipe — declared the wrong way round,
 * the stats call answers with a 400 about an invalid UUID.
 *
 * Enforcement: the permissions guard is left real here. The bug this module
 * replaces was a guard that returned true for everything, and a mocked guard
 * would reproduce it exactly.
 */
describe("AdminRoleController", () => {
  let app: INestApplication;
  /** Swapped per-test by the stubbed auth guard. */
  let caller: unknown;

  const service = {
    catalog: jest.fn().mockReturnValue([{ key: "dashboard", label: "داشبورد" }]),
    list: jest.fn().mockResolvedValue([]),
    stats: jest.fn().mockResolvedValue({ total: 4, totalMembers: 3, fixed: 4, empty: 1 }),
    findOne: jest.fn().mockResolvedValue({ id: "r-1", permissions: ["dashboard"] }),
    members: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "r-new" }),
    update: jest.fn().mockResolvedValue({ id: "r-1" }),
    setPermissions: jest.fn().mockResolvedValue({ id: "r-1" }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const admin = (permissions: string[], slug = "custom") => ({
    id: "a-1",
    isSuspended: false,
    roleId: "r-caller",
    roleRef: { id: "r-caller", slug, permissions },
  });

  const root = admin([], ROOT_ROLE_SLUG);
  const UUID = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminRoleController],
      providers: [AdminRoleService, AdminPermissionsGuard],
    })
      .overrideProvider(AdminRoleService)
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
    // Same pipe main.ts installs, so DTO validation is exercised here too.
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    await app.init();
  });

  afterAll(async () => app?.close());
  beforeEach(() => {
    caller = root;
    jest.clearAllMocks();
  });

  const url = (p: string) => `/api/v1/admin/${p}`;

  describe("route ordering", () => {
    it("answers roles/stats from the stats handler, not roles/:id", async () => {
      const res = await request(app.getHttpServer()).get(url("roles/stats")).expect(200);
      expect(service.stats).toHaveBeenCalled();
      expect(service.findOne).not.toHaveBeenCalled();
      expect(res.body.data.total).toBe(4);
    });

    it("still rejects a non-UUID id with a 400", async () => {
      await request(app.getHttpServer()).get(url("roles/not-a-uuid")).expect(400);
    });

    it("routes the catalog and the caller's own set to their own handlers", async () => {
      await request(app.getHttpServer()).get(url("permissions")).expect(200);
      expect(service.catalog).toHaveBeenCalled();

      const mine = await request(app.getHttpServer()).get(url("me/permissions")).expect(200);
      expect(mine.body.data).toEqual([...PERMISSION_KEYS]);
    });

    it("answers a delete with 200, not the default 201-adjacent shape", async () => {
      await request(app.getHttpServer()).delete(url(`roles/${UUID}`)).expect(200);
      expect(service.remove).toHaveBeenCalledWith(UUID);
    });

    it("answers a permissions replace with 200, since it creates nothing", async () => {
      await request(app.getHttpServer())
        .put(url(`roles/${UUID}/permissions`))
        .send({ permissions: ["dashboard"] })
        .expect(200);
    });

    it("answers a role create with 201", async () => {
      await request(app.getHttpServer())
        .post(url("roles"))
        .send({ roleName: "Ops", permissions: ["dashboard"] })
        .expect(201);
    });
  });

  describe("enforcement", () => {
    it("refuses a read to an admin without roles_view", async () => {
      caller = admin(["dashboard"]);
      await request(app.getHttpServer()).get(url("roles")).expect(403);
      expect(service.list).not.toHaveBeenCalled();
    });

    it("refuses a write to an admin who can only view", async () => {
      caller = admin(["roles_view"]);
      await request(app.getHttpServer()).get(url("roles")).expect(200);
      await request(app.getHttpServer())
        .post(url("roles"))
        .send({ roleName: "Ops", permissions: [] })
        .expect(403);
      expect(service.create).not.toHaveBeenCalled();
    });

    it("lets an operator read their own permissions with no permission at all", async () => {
      // Otherwise the panel cannot decide what to render and shows nothing.
      caller = admin([]);
      const res = await request(app.getHttpServer()).get(url("me/permissions")).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it("refuses everything to a suspended admin", async () => {
      caller = { ...root, isSuspended: true };
      await request(app.getHttpServer()).get(url("roles")).expect(403);
    });

    it("validates the body before the service sees it", async () => {
      await request(app.getHttpServer()).post(url("roles")).send({ permissions: [] }).expect(400);
      expect(service.create).not.toHaveBeenCalled();
    });
  });
});
