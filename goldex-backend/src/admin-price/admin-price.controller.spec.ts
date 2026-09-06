import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { AdminPriceController } from "./admin-price.controller";
import { AdminPriceService } from "./admin-price.service";

/**
 * The permission guard is real. What matters here is that the price screen is
 * gated on `price_engine` — the market ticker deliberately is not, and it would
 * be easy to copy that decision into a controller that closes markets and turns
 * price feeds off.
 */
describe("AdminPriceController", () => {
  let app: INestApplication;
  let caller: unknown;

  const svc = {
    instruments: jest.fn().mockResolvedValue({ groups: [], total: 0 }),
    historyFor: jest.fn().mockResolvedValue({ series: [], rows: [] }),
    setMarketStatus: jest.fn().mockResolvedValue({ slug: "XAU" }),
    engineConfig: jest.fn().mockResolvedValue({ sources: [] }),
    updateEngineConfig: jest.fn().mockResolvedValue({ sources: [] }),
  };

  const admin = (permissions: string[]) => ({
    id: "a-1", isSuspended: false, roleId: "r-1",
    roleRef: { id: "r-1", slug: "custom", permissions },
  });
  const UUID = "11111111-1111-4111-8111-111111111111";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminPriceController],
      providers: [AdminPriceService, AdminPermissionsGuard],
    })
      .overrideProvider(AdminPriceService).useValue(svc)
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
    caller = admin(["price_engine"]);
    jest.clearAllMocks();
  });

  const url = (p: string) => `/api/v1/admin/price/${p}`;
  const get = (p: string) => request(app.getHttpServer()).get(url(p));

  it("answers each route from its own handler", async () => {
    await get("instruments").expect(200);
    expect(svc.instruments).toHaveBeenCalled();

    await get("history?symbols=XAU").expect(200);
    expect(svc.historyFor).toHaveBeenCalled();

    await get("engine-config").expect(200);
    expect(svc.engineConfig).toHaveBeenCalled();
  });

  it("does not let `instruments/:id/market-status` shadow the instruments list", async () => {
    // Both live under `instruments`; a controller that matched the list route
    // greedily would answer the PATCH with the catalogue.
    await request(app.getHttpServer())
      .patch(url(`instruments/${UUID}/market-status`))
      .send({ open: false })
      .expect(200);
    expect(svc.setMarketStatus).toHaveBeenCalledWith(UUID, { open: false });
    expect(svc.instruments).not.toHaveBeenCalled();
  });

  it("refuses every route without the price_engine permission", async () => {
    caller = admin(["dashboard"]);
    await get("instruments").expect(403);
    await get("history?symbols=XAU").expect(403);
    await get("engine-config").expect(403);
    await request(app.getHttpServer()).patch(url("engine-config")).send({}).expect(403);
    await request(app.getHttpServer())
      .patch(url(`instruments/${UUID}/market-status`)).send({ open: true }).expect(403);
    expect(svc.instruments).not.toHaveBeenCalled();
    expect(svc.updateEngineConfig).not.toHaveBeenCalled();
  });

  it("rejects a market-status id that is not a uuid", async () => {
    await request(app.getHttpServer())
      .patch(url("instruments/not-a-uuid/market-status")).send({ open: true }).expect(400);
  });

  it("requires `symbols` on the history route rather than charting everything", async () => {
    await get("history").expect(400);
    expect(svc.historyFor).not.toHaveBeenCalled();
  });

  it("validates the history window bounds", async () => {
    await get("history?symbols=XAU&points=1").expect(400);
    await get("history?symbols=XAU&points=501").expect(400);
    await get("history?symbols=XAU&hours=0").expect(400);
    await get("history?symbols=XAU&points=30&hours=24").expect(200);
  });

  it("takes `open` as a boolean, not a string", async () => {
    await request(app.getHttpServer())
      .patch(url(`instruments/${UUID}/market-status`)).send({ open: "yes" }).expect(400);
  });

  it("accepts a null `open` — the documented way to clear an override", async () => {
    await request(app.getHttpServer())
      .patch(url(`instruments/${UUID}/market-status`)).send({ open: null }).expect(200);
    expect(svc.setMarketStatus).toHaveBeenCalledWith(UUID, { open: null });
  });

  it("validates the engine-config body", async () => {
    await request(app.getHttpServer()).patch(url("engine-config"))
      .send({ refreshIntervalSec: 0 }).expect(400);
    await request(app.getHttpServer()).patch(url("engine-config"))
      .send({ refreshIntervalSec: 301 }).expect(400);
    await request(app.getHttpServer()).patch(url("engine-config"))
      .send({ sources: [{ key: "tgju" }] }).expect(400);
    await request(app.getHttpServer()).patch(url("engine-config"))
      .send({ sources: [{ key: "tgju", active: true }], refreshIntervalSec: 5 }).expect(200);
  });
});
