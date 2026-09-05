import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminAccountingController } from "./admin-accounting.controller";
import { AdminAccountingService } from "./admin-accounting.service";
import { AccountingExportService } from "./accounting-export.service";

/**
 * Route ordering over the real pipeline.
 *
 * `catalogs`, `ledger/export` and `vouchers/export` are literal segments that
 * sit where `vouchers/:id` also matches, and `:id` is behind a ParseUUIDPipe —
 * so the wrong declaration order answers an export with a 400 about an invalid
 * UUID, which reads like a client bug for a day.
 */
describe("AdminAccountingController routing", () => {
  let app: INestApplication;

  const service = {
    stats: jest.fn().mockResolvedValue({}),
    series: jest.fn().mockResolvedValue({}),
    ledgerRows: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    ledgerForExport: jest.fn().mockResolvedValue([]),
    catalogs: jest.fn().mockResolvedValue({}),
    listVouchers: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    vouchersForExport: jest.fn().mockResolvedValue([]),
    findVoucher: jest.fn().mockResolvedValue({}),
    createVoucher: jest.fn().mockResolvedValue({}),
    submitVoucher: jest.fn().mockResolvedValue({}),
    finalizeVoucher: jest.fn().mockResolvedValue({}),
    rejectVoucher: jest.fn().mockResolvedValue({}),
  };
  const exporter = {
    streamLedger: jest.fn(async (_rows: unknown, res: any) => res.end("x")),
    streamVouchers: jest.fn(async (_rows: unknown, res: any) => res.end("x")),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAccountingController],
      providers: [
        { provide: AdminAccountingService, useValue: service },
        { provide: AccountingExportService, useValue: exporter },
      ],
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

  const base = "/api/v1/admin/accounting";

  it("routes ledger/export to the exporter, not to a voucher id", async () => {
    await request(app.getHttpServer()).get(`${base}/ledger/export`).expect(200);
    expect(exporter.streamLedger).toHaveBeenCalled();
    expect(service.findVoucher).not.toHaveBeenCalled();
  });

  it("routes vouchers/export to the exporter, not to a voucher id", async () => {
    await request(app.getHttpServer()).get(`${base}/vouchers/export`).expect(200);
    expect(exporter.streamVouchers).toHaveBeenCalled();
    expect(service.findVoucher).not.toHaveBeenCalled();
  });

  it("routes catalogs to catalogs", async () => {
    await request(app.getHttpServer()).get(`${base}/catalogs`).expect(200);
    expect(service.catalogs).toHaveBeenCalled();
  });

  it("still rejects a malformed voucher id", async () => {
    await request(app.getHttpServer()).get(`${base}/vouchers/not-a-uuid`).expect(400);
  });

  it("routes a real id to detail, finalize and reject", async () => {
    const id = "11111111-1111-1111-1111-111111111111";
    await request(app.getHttpServer()).get(`${base}/vouchers/${id}`).expect(200);
    await request(app.getHttpServer()).post(`${base}/vouchers/${id}/finalize`).send({}).expect(201);
    await request(app.getHttpServer()).post(`${base}/vouchers/${id}/reject`).send({}).expect(201);
    expect(service.finalizeVoucher).toHaveBeenCalledWith("admin-1", id, expect.anything());
    expect(service.rejectVoucher).toHaveBeenCalledWith("admin-1", id, expect.anything());
  });

  it("passes the authenticated admin as the actor on create", async () => {
    // Every workflow control depends on this being the caller, not a body field.
    await request(app.getHttpServer())
      .post(`${base}/vouchers`)
      .send({
        movement: "deposit",
        customerName: "x",
        customerType: "formal",
        category: "fee",
        symbolId: "11111111-1111-1111-1111-111111111111",
        amount: "100",
        walletType: "DEPOSIT",
        walletSubset: "cash",
        description: "d",
        documentDate: new Date().toISOString(),
      })
      .expect(201);
    expect(service.createVoucher).toHaveBeenCalledWith("admin-1", expect.anything());
  });
});
