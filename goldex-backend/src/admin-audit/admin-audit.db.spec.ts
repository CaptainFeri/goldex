import "reflect-metadata";
import { DataSource } from "typeorm";
import { AdminAuditLogEntity } from "./entity/admin-audit-log.entity";
import { AdminAuditService } from "./admin-audit.service";
import { AuditQueryDto } from "./dto/admin-audit.dto";

/**
 * Against a real database, because the parts worth checking are SQL: the jsonb
 * round-trip of a redacted body, the filters, and that the table takes a row
 * with no admin at all (a failed login has no actor yet).
 *
 *   GOLDEX_DB_SPECS=1 npx jest src/admin-audit/admin-audit.db.spec.ts
 */
const ENABLED = process.env.GOLDEX_DB_SPECS === "1";
const describeDb = ENABLED ? describe : describe.skip;

let ds: DataSource;
let svc: AdminAuditService;

const q = (over: Partial<AuditQueryDto> = {}) => Object.assign(new AuditQueryDto(), over);

const entry = (over: Record<string, unknown> = {}) =>
  ({
    adminId: null, adminLabel: "علی", permission: "accounting",
    action: "POST /admin/accounting/vouchers/:id/finalize",
    entity: "accounting/vouchers", entityId: "v-1",
    before: null, after: { amount: "5000000", otp: "[redacted]" },
    otpChallengeId: "c-1", statusCode: 201, errorMessage: null,
    ip: "10.0.0.1", userAgent: "jest", durationMs: 12, ...over,
  }) as any;

beforeAll(async () => {
  if (!ENABLED) return;
  ds = new DataSource({
    type: "postgres",
    host: process.env.GOLDEX_AUTH_POSTGRES_URL ?? "/tmp",
    port: Number(process.env.GOLDEX_AUTH_POSTGRES_PORT ?? 5433),
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME ?? "postgres",
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD ?? "postgres",
    database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME ?? "base-db",
    entities: [AdminAuditLogEntity],
    synchronize: false,
  });
  await ds.initialize();
  svc = new AdminAuditService(ds.getRepository(AdminAuditLogEntity) as any);
});
afterAll(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM admin_audit_log`);
  await ds.destroy();
});
beforeEach(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM admin_audit_log`);
});

describeDb("admin audit log against real Postgres", () => {
  it("stores a row with no admin — a failed login has no actor yet", async () => {
    await svc.record(entry({ adminId: null, adminLabel: null }));
    expect((await svc.list(q())).total).toBe(1);
  });

  it("round-trips the redacted body through jsonb intact", async () => {
    await svc.record(entry());
    const [row] = (await svc.list(q())).items;
    expect(row.after).toEqual({ amount: "5000000", otp: "[redacted]" });
  });

  it("keeps Persian text intact", async () => {
    await svc.record(entry({ after: { note: "مدارک بررسی شد" } }));
    const [row] = (await svc.list(q())).items;
    expect((row.after as any).note).toBe("مدارک بررسی شد");
  });

  it("returns newest first", async () => {
    for (const a of ["one", "two", "three"]) await svc.record(entry({ action: a }));
    expect((await svc.list(q())).items.map((r) => r.action)).toEqual(["three", "two", "one"]);
  });

  it("filters by entity, id, action substring and failure", async () => {
    await svc.record(entry({ entity: "roles", entityId: "r-1", action: "PATCH /admin/roles/:id" }));
    await svc.record(entry({ entity: "shahin/transfer", entityId: null, statusCode: 403, errorMessage: "denied" }));

    expect((await svc.list(q({ entity: "roles" }))).total).toBe(1);
    expect((await svc.list(q({ entityId: "r-1" }))).total).toBe(1);
    expect((await svc.list(q({ action: "roles" }))).total).toBe(1);
    expect((await svc.list(q({ failedOnly: true }))).total).toBe(1);
    expect((await svc.list(q({ failedOnly: true }))).items[0].errorMessage).toBe("denied");
  });

  it("gathers everything recorded against one record", async () => {
    await svc.record(entry({ entity: "em/requests", entityId: "x-1", action: "a" }));
    await svc.record(entry({ entity: "em/requests", entityId: "x-1", action: "b" }));
    await svc.record(entry({ entity: "em/requests", entityId: "x-2", action: "c" }));
    const rows = await svc.forEntity("em/requests", "x-1");
    expect(rows.map((r) => r.action).sort()).toEqual(["a", "b"]);
  });

  it("pages without losing rows", async () => {
    for (let i = 0; i < 7; i++) await svc.record(entry({ action: `a${i}` }));
    const p1 = await svc.list(q({ page: 1, pageSize: 3 }));
    const p2 = await svc.list(q({ page: 2, pageSize: 3 }));
    const p3 = await svc.list(q({ page: 3, pageSize: 3 }));
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([3, 3, 1]);
    expect(p1.total).toBe(7);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((r) => r.id)).size).toBe(7);
  });

  it("takes a very long user agent without erroring", async () => {
    // Truncated by the interceptor, but the column must not be the thing that
    // fails a mutation if something slips past.
    await expect(svc.record(entry({ userAgent: "x".repeat(400) }))).resolves.toBeUndefined();
    expect((await svc.list(q())).total).toBe(1);
  });
});
