import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminNotificationController } from "../notification/admin-notification.controller";
import { AdminNotificationGateway } from "../notification/admin-notification.gateway";
import { NotificationService } from "../notification/notification.service";
import { NotificationBroadcastService } from "../notification/notification-broadcast.service";
import { AdminInboxController } from "./admin-inbox.controller";
import { AdminInboxService } from "./admin-inbox.service";

/**
 * The inbox is mounted *inside* the outbound controller's prefix:
 * `admin/notifications/inbox` under `admin/notifications`. That nesting is the
 * whole reason this file exists.
 *
 * The plan asked for the inbox at `admin/notifications/stats` and
 * `admin/notifications/:id/read`. `GET /admin/notifications/stats` already
 * exists and means "delivery stats for messages sent to users" — taking it
 * would have shadowed a working endpoint with one answering a different
 * question, and nothing in a per-controller test would have caught it.
 *
 * Mounted together, each controller must still answer its own routes.
 */
describe("admin/notifications prefix", () => {
  let app: INestApplication;

  const outbound = {
    findAll: jest.fn().mockResolvedValue({ items: [] }),
    getAdminStats: jest.fn().mockResolvedValue({ sent: 12, failed: 1 }),
  };
  const inbox = {
    inbox: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    stats: jest.fn().mockResolvedValue({ unread: 3, urgent: 0, today: 0, realtimeEnabled: false, connectedAdmins: 0 }),
    unreadCount: jest.fn().mockResolvedValue({ unread: 3 }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminNotificationController, AdminInboxController],
      providers: [
        { provide: NotificationService, useValue: outbound },
        { provide: NotificationBroadcastService, useValue: {} },
        { provide: AdminInboxService, useValue: inbox },
        { provide: AdminNotificationGateway, useValue: { connectedAdminCount: () => 0 } },
      ],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().admin = {
            id: "a-1", isSuspended: false, roleRef: { id: "r", slug: "s", permissions: ["dashboard"] },
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
  beforeEach(() => jest.clearAllMocks());

  const base = "/api/v1/admin/notifications";

  it("keeps the outbound delivery stats answering delivery stats", async () => {
    const res = await request(app.getHttpServer()).get(`${base}/stats`).expect(200);
    expect(outbound.getAdminStats).toHaveBeenCalled();
    expect(inbox.stats).not.toHaveBeenCalled();
    expect(res.body.data).toMatchObject({ sent: 12 });
  });

  it("answers the inbox stats from the inbox", async () => {
    const res = await request(app.getHttpServer()).get(`${base}/inbox/stats`).expect(200);
    expect(inbox.stats).toHaveBeenCalled();
    expect(outbound.getAdminStats).not.toHaveBeenCalled();
    expect(res.body.data).toMatchObject({ unread: 3 });
  });

  it("does not let the outbound list swallow the inbox list", async () => {
    await request(app.getHttpServer()).get(`${base}/inbox`).expect(200);
    expect(inbox.inbox).toHaveBeenCalled();
    expect(outbound.findAll).not.toHaveBeenCalled();

    await request(app.getHttpServer()).get(base).expect(200);
    expect(outbound.findAll).toHaveBeenCalled();
  });
});
