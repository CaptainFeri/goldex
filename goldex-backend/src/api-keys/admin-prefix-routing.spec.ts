import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { AdminRoleController } from "../admin-role/admin-role.controller";
import { AdminRoleService } from "../admin-role/admin-role.service";
import { ApiKeyController } from "./api-key.controller";
import { ApiKeyService } from "./api-key.service";

/**
 * Three controllers now mount on the `admin` prefix. Mounted together, each
 * one's routes must still resolve to its own handler — a path added on one
 * that shadowed another would quietly take those routes away, and testing the
 * controllers in isolation would never show it.
 */
describe("controllers sharing the admin prefix", () => {
  let app: INestApplication;

  const roles = {
    catalog: jest.fn().mockReturnValue([]),
    list: jest.fn().mockResolvedValue([]),
    stats: jest.fn().mockResolvedValue({}),
  };
  const apiKeys = {
    list: jest.fn().mockResolvedValue([]),
    stats: jest.fn().mockResolvedValue({}),
    traffic: jest.fn().mockResolvedValue({ points: [] }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminRoleController, ApiKeyController],
      providers: [AdminRoleService, ApiKeyService, AdminPermissionsGuard],
    })
      .overrideProvider(AdminRoleService).useValue(roles)
      .overrideProvider(ApiKeyService).useValue(apiKeys)
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().admin = {
            id: "a-1", isSuspended: false,
            roleRef: { id: "r", slug: "custom", permissions: ["roles_view", "api"] },
          };
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

  it("keeps the roles routes reachable alongside the API-key ones", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/roles").expect(200);
    expect(roles.list).toHaveBeenCalled();

    await request(app.getHttpServer()).get("/api/v1/admin/api-keys").expect(200);
    expect(apiKeys.list).toHaveBeenCalled();
  });

  it("does not let `admin/permissions` and `admin/api/...` shadow each other", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/permissions").expect(200);
    expect(roles.catalog).toHaveBeenCalled();

    await request(app.getHttpServer()).get("/api/v1/admin/api/stats").expect(200);
    expect(apiKeys.stats).toHaveBeenCalled();
  });
});
