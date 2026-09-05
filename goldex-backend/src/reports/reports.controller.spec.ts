import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

/**
 * Route ordering, over the real Nest pipeline.
 *
 * `stats` and `schedules` are literal segments sitting where `:id` also
 * matches, and `:id` is behind a ParseUUIDPipe — so a controller that declared
 * them in the wrong order would answer `GET /admin/reports/stats` with a 400
 * about an invalid UUID. That is exactly the kind of break that looks like a
 * client bug for a day.
 */
describe("ReportsController routing", () => {
  let app: INestApplication;

  const service = {
    stats: jest.fn().mockResolvedValue({ generated: 1, activeSchedules: 0, downloadsThisMonth: 0, averageDurationMs: null }),
    listSchedules: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    findOne: jest.fn().mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111" }),
    download: jest.fn().mockResolvedValue({ url: "/api/v1/files/signed/tok.sig", fileName: "x.xlsx" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: service }],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().admin = { id: "admin-1", role: AdminRole.FINANCE };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    await app.init();
  });

  afterAll(async () => await app?.close());

  it("routes /reports/stats to stats, not to :id", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/reports/stats").expect(200);
    expect(service.stats).toHaveBeenCalled();
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it("routes /reports/schedules to the schedule list, not to :id", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/reports/schedules").expect(200);
    expect(service.listSchedules).toHaveBeenCalled();
  });

  it("still rejects a genuinely malformed id", async () => {
    await request(app.getHttpServer()).get("/api/v1/admin/reports/not-a-uuid").expect(400);
  });

  it("routes a real id to detail and to download", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    await request(app.getHttpServer()).get(`/api/v1/admin/reports/${id}`).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/admin/reports/${id}/download`).expect(200);
    expect(service.findOne).toHaveBeenCalled();
    expect(service.download).toHaveBeenCalled();
  });

  it("passes the authenticated admin through as the caller", async () => {
    // The visibility rule is only as good as the identity it is given.
    await request(app.getHttpServer()).get("/api/v1/admin/reports").expect(200);
    expect(service.list).toHaveBeenCalledWith(
      { adminId: "admin-1", role: AdminRole.FINANCE },
      expect.anything(),
    );
  });
});
