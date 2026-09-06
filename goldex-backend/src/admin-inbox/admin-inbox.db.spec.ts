import "reflect-metadata";
import { DataSource } from "typeorm";

/**
 * The inbox against a real database.
 *
 * Most of this module's behaviour *is* SQL — a LEFT JOIN carrying per-caller
 * read state, an ON CONFLICT that makes "mark read" idempotent, and a
 * permission filter whose empty case builds invalid SQL if written naively.
 * A faked repository would assert the shape of my own mock rather than any of
 * that, so these run against Postgres.
 *
 * Opt-in, because the rest of the suite needs no database:
 *
 *   GOLDEX_DB_SPECS=1 npx jest src/admin-inbox/admin-inbox.db.spec.ts
 *
 * Point it at a database with the migrations applied via the usual
 * GOLDEX_AUTH_POSTGRES_* variables (defaults below match the local dev socket).
 */
const ENABLED = process.env.GOLDEX_DB_SPECS === "1";
const describeDb = ENABLED ? describe : describe.skip;

import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminRoleEntity } from "../admin-role/entity/admin-role.entity";
import { AdminNotificationEntity } from "./entity/admin-notification.entity";
import { AdminNotificationReadEntity } from "./entity/admin-notification-read.entity";
import { AdminInboxService } from "./admin-inbox.service";
import { InboxCategory, InboxSeverity } from "./admin-inbox.enums";
import { InboxQueryDto } from "./dto/admin-inbox.dto";

jest.setTimeout(60000);

let ds: DataSource;
let svc: AdminInboxService;
let root: AdminEntity;      // holds everything
let warehouse: AdminEntity; // holds warehouse + dashboard only
let bare: AdminEntity;      // holds nothing

const q = (over: Partial<InboxQueryDto> = {}) => Object.assign(new InboxQueryDto(), over);

beforeAll(async () => {
  if (!ENABLED) return;
  ds = new DataSource({
    type: "postgres", host: process.env.GOLDEX_AUTH_POSTGRES_URL ?? "/tmp",
    port: Number(process.env.GOLDEX_AUTH_POSTGRES_PORT ?? 5433),
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME ?? "postgres",
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD ?? "postgres",
    database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME ?? "base-db",
    entities: [AdminEntity, AdminRoleEntity, AdminNotificationEntity, AdminNotificationReadEntity],
    synchronize: false,
  });
  await ds.initialize();
  svc = new AdminInboxService(
    ds.getRepository(AdminNotificationEntity) as any,
    ds.getRepository(AdminNotificationReadEntity) as any,
  );
  const roles = ds.getRepository(AdminRoleEntity);
  const admins = ds.getRepository(AdminEntity);
  root = (await admins.findOne({ where: { email: "admin@goldex.local" }, relations: { roleRef: true } }))!;

  const wRole = (await roles.findOne({ where: { slug: "warehouse" } }))!;
  warehouse = await admins.save(admins.create({ email: "wh@t.local", role: "warehouse" as any, roleId: wRole.id }));
  warehouse = (await admins.findOne({ where: { id: warehouse.id }, relations: { roleRef: true } }))!;

  bare = await admins.save(admins.create({ email: "bare@t.local", role: "admin" as any, roleId: null }));
  bare = (await admins.findOne({ where: { id: bare.id }, relations: { roleRef: true } }))!;
});

afterAll(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM admin_notification_reads`);
  await ds.query(`DELETE FROM admin_notifications`);
  await ds.query(`DELETE FROM admin WHERE email IN ('wh@t.local','bare@t.local')`);
  await ds.destroy();
});

beforeEach(async () => {
  if (!ENABLED) return;
  await ds.query(`DELETE FROM admin_notification_reads`);
  await ds.query(`DELETE FROM admin_notifications`);
});

const seed = () => Promise.all([
  svc.publish({ event: "withdraw.created", title: "برداشت", body: "b",
    category: InboxCategory.WITHDRAWAL, requiredPermission: "withdrawals_view" }),
  svc.publish({ event: "warehouse.low", title: "انبار", body: "b",
    category: InboxCategory.SYSTEM, requiredPermission: "warehouse" }),
  svc.publish({ event: "system.up", title: "سیستم", body: "b", category: InboxCategory.SYSTEM }),
  svc.publish({ event: "p2p.escalated", title: "ارجاع", body: "b",
    category: InboxCategory.WITHDRAWAL, severity: InboxSeverity.URGENT, requiredPermission: "withdrawals_view" }),
]);

describeDb("inbox visibility", () => {
  it("shows an operator only what their permissions cover, plus unrestricted items", async () => {
    await seed();
    const asRoot = await svc.inbox(root, q());
    expect(asRoot.total).toBe(4);

    const asWarehouse = await svc.inbox(warehouse, q());
    expect(asWarehouse.items.map((i) => i.event).sort()).toEqual(["system.up", "warehouse.low"]);
  });

  it("shows an admin with no role only the unrestricted items, rather than erroring or showing all", async () => {
    // `IN (:...held)` on an empty array is invalid SQL — this is the case that
    // would either throw or, worse, be silently dropped from the WHERE clause.
    await seed();
    const asBare = await svc.inbox(bare, q());
    expect(asBare.items.map((i) => i.event)).toEqual(["system.up"]);
    expect((await svc.unreadCount(bare)).unread).toBe(1);
  });
});

describeDb("per-admin read state", () => {
  it("does not clear an item for everyone when one operator reads it", async () => {
    const [w] = await seed();
    await svc.markRead(root, w.id);
    expect((await svc.unreadCount(root)).unread).toBe(3);
    // The warehouse operator never saw that item anyway; check a shared one.
    const shared = (await svc.inbox(warehouse, q())).items.find((i) => i.event === "system.up")!;
    await svc.markRead(warehouse, shared.id);
    expect((await svc.unreadCount(warehouse)).unread).toBe(1);
    expect((await svc.unreadCount(root)).unread).toBe(3);
  });

  it("is idempotent — marking the same item twice does not double-count or fail", async () => {
    const [w] = await seed();
    expect((await svc.markRead(root, w.id)).marked).toBe(1);
    expect((await svc.markRead(root, w.id)).marked).toBe(0);
    const rows = await ds.query(
      `SELECT count(*)::int AS c FROM admin_notification_reads WHERE notification_id = $1`, [w.id]);
    expect(rows[0].c).toBe(1);
  });

  it("reports isRead and readAt per caller", async () => {
    const [w] = await seed();
    await svc.markRead(root, w.id);
    const item = (await svc.inbox(root, q())).items.find((i) => i.id === w.id)!;
    expect(item.isRead).toBe(true);
    expect(item.readAt).toBeInstanceOf(Date);
    const others = (await svc.inbox(root, q())).items.filter((i) => i.id !== w.id);
    expect(others.every((i) => i.isRead === false && i.readAt === null)).toBe(true);
  });

  it("refuses to mark an item the caller cannot see, and reports it as absent", async () => {
    const [w] = await seed();
    await expect(svc.markRead(warehouse, w.id)).rejects.toThrow(/NOT_FOUND/);
  });

  it("read-all clears only what the caller can see", async () => {
    await seed();
    expect((await svc.markAllRead(warehouse)).marked).toBe(2);
    expect((await svc.unreadCount(warehouse)).unread).toBe(0);
    // Root's own unread count is untouched: nobody read on their behalf.
    expect((await svc.unreadCount(root)).unread).toBe(4);
  });

  it("read-all on an empty inbox is a no-op", async () => {
    expect((await svc.markAllRead(root)).marked).toBe(0);
  });
});

describeDb("filtering, ordering and paging", () => {
  it("returns newest first", async () => {
    for (const e of ["a", "b", "c"]) {
      await svc.publish({ event: e, title: e, body: "b" });
    }
    const { items } = await svc.inbox(root, q());
    expect(items.map((i) => i.event)).toEqual(["c", "b", "a"]);
  });

  it("filters by unreadOnly, category and severity", async () => {
    await seed();
    const [first] = (await svc.inbox(root, q())).items;
    await svc.markRead(root, first.id);

    expect((await svc.inbox(root, q({ unreadOnly: true }))).total).toBe(3);
    expect((await svc.inbox(root, q({ category: InboxCategory.WITHDRAWAL }))).total).toBe(2);
    expect((await svc.inbox(root, q({ severity: InboxSeverity.URGENT }))).total).toBe(1);
  });

  it("pages without losing or repeating rows", async () => {
    for (let i = 0; i < 7; i++) await svc.publish({ event: `e${i}`, title: `t${i}`, body: "b" });
    const p1 = await svc.inbox(root, q({ page: 1, pageSize: 3 }));
    const p2 = await svc.inbox(root, q({ page: 2, pageSize: 3 }));
    const p3 = await svc.inbox(root, q({ page: 3, pageSize: 3 }));
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([3, 3, 1]);
    expect(p1.total).toBe(7);
    const all = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(all).size).toBe(7);
  });

  it("counts the total against the filter, not the page", async () => {
    await seed();
    const page = await svc.inbox(root, q({ pageSize: 1 }));
    expect(page.items.length).toBe(1);
    expect(page.total).toBe(4);
  });
});

describeDb("stats", () => {
  it("counts unread, urgent and today for the caller", async () => {
    await seed();
    const s = await svc.stats(root);
    expect(s.unread).toBe(4);
    expect(s.urgent).toBe(1);
    expect(s.today).toBe(4);
    expect(s.realtimeEnabled).toBe(false);
  });

  it("scopes its counters by permission too", async () => {
    await seed();
    const s = await svc.stats(warehouse);
    expect(s.unread).toBe(2);
    // The urgent item is a withdrawal one the warehouse operator cannot see.
    expect(s.urgent).toBe(0);
  });

  it("reports the realtime feed when a broadcaster is present", async () => {
    const s = await svc.stats(root, { sendToAdmins: () => undefined, connectedAdminCount: () => 3 });
    expect(s.realtimeEnabled).toBe(true);
    expect(s.connectedAdmins).toBe(3);
  });
});

describeDb("publish", () => {
  it("stores the item even when the broadcast throws", async () => {
    const exploding = { sendToAdmins: () => { throw new Error("socket down"); } };
    const saved = await svc.publish({ event: "x", title: "t", body: "b" }, exploding);
    expect(saved.id).toBeDefined();
    expect((await svc.inbox(root, q())).total).toBe(1);
  });

  it("keeps the amount in metadata rather than baked into the body", async () => {
    const saved = await svc.publish({
      event: "withdraw.created", title: "t", body: "b", metadata: { amount: 25_000_000 },
    });
    expect(saved.metadata).toEqual({ amount: 25_000_000 });
    expect(saved.body).not.toMatch(/\d/);
  });
});
