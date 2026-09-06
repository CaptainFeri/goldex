import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminNotificationGateway } from "../notification/admin-notification.gateway";
import { AdminInboxController } from "./admin-inbox.controller";
import { AdminInboxService } from "./admin-inbox.service";

/**
 * The inbox is nested under `admin/notifications`, which already belongs to
 * the outbound notification controller. These check that the nesting resolves
 * the way it reads, and that query parsing does not quietly mangle filters —
 * `unreadOnly=false` arriving as the string "false" would otherwise be truthy
 * and filter anyway.
 */
describe("AdminInboxController", () => {
  let app: INestApplication;

  const service = {
    inbox: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    unreadCount: jest.fn().mockResolvedValue({ unread: 3 }),
    stats: jest.fn().mockResolvedValue({ unread: 3, urgent: 1, today: 5, realtimeEnabled: true, connectedAdmins: 2 }),
    markRead: jest.fn().mockResolvedValue({ marked: 1 }),
    markAllRead: jest.fn().mockResolvedValue({ marked: 3 }),
  };
  const gateway = { sendToAdmins: jest.fn(), connectedAdminCount: jest.fn().mockReturnValue(2) };
  const UUID = "11111111-1111-1111-1111-111111111111";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminInboxController],
      providers: [
        { provide: AdminInboxService, useValue: service },
        { provide: AdminNotificationGateway, useValue: gateway },
      ],
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().admin = {
            id: "a-1", isSuspended: false,
            roleRef: { id: "r-1", slug: "custom", permissions: ["dashboard"] },
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

  const url = (p = "") => `/api/v1/admin/notifications/inbox${p}`;

  it("routes the literal segments to their own handlers", async () => {
    await request(app.getHttpServer()).get(url("/unread-count")).expect(200);
    expect(service.unreadCount).toHaveBeenCalled();
    expect(service.inbox).not.toHaveBeenCalled();

    await request(app.getHttpServer()).get(url("/stats")).expect(200);
    expect(service.stats).toHaveBeenCalled();

    await request(app.getHttpServer()).get(url()).expect(200);
    expect(service.inbox).toHaveBeenCalled();
  });

  it("answers both mark-read routes with 200, since neither creates anything", async () => {
    await request(app.getHttpServer()).patch(url("/read-all")).expect(200);
    expect(service.markAllRead).toHaveBeenCalled();
    expect(service.markRead).not.toHaveBeenCalled();

    await request(app.getHttpServer()).patch(url(`/${UUID}/read`)).expect(200);
    expect(service.markRead).toHaveBeenCalledWith(expect.anything(), UUID);
  });

  it("rejects a non-UUID id rather than passing it to the service", async () => {
    await request(app.getHttpServer()).patch(url("/not-a-uuid/read")).expect(400);
    expect(service.markRead).not.toHaveBeenCalled();
  });

  it("parses unreadOnly as a boolean, both ways", async () => {
    await request(app.getHttpServer()).get(url("?unreadOnly=true")).expect(200);
    expect(service.inbox.mock.calls[0][1].unreadOnly).toBe(true);

    // The bug this guards: "false" is a non-empty string, so a naive cast
    // would filter to unread anyway.
    await request(app.getHttpServer()).get(url("?unreadOnly=false")).expect(200);
    expect(service.inbox.mock.calls[1][1].unreadOnly).toBe(false);
  });

  it("passes category and severity through, and rejects values outside the enums", async () => {
    await request(app.getHttpServer()).get(url("?category=withdrawal&severity=urgent")).expect(200);
    expect(service.inbox.mock.calls[0][1]).toMatchObject({ category: "withdrawal", severity: "urgent" });

    await request(app.getHttpServer()).get(url("?category=banana")).expect(400);
    await request(app.getHttpServer()).get(url("?severity=loud")).expect(400);
  });

  it("enforces the shared pagination bounds", async () => {
    await request(app.getHttpServer()).get(url("?page=0")).expect(400);
    await request(app.getHttpServer()).get(url("?pageSize=1000")).expect(400);
    await request(app.getHttpServer()).get(url("?page=2&pageSize=5")).expect(200);
    expect(service.inbox.mock.calls.at(-1)![1]).toMatchObject({ page: 2, pageSize: 5 });
  });

  it("hands the gateway to stats so realtime can be reported rather than assumed", async () => {
    await request(app.getHttpServer()).get(url("/stats")).expect(200);
    expect(service.stats).toHaveBeenCalledWith(expect.anything(), gateway);
  });
});
