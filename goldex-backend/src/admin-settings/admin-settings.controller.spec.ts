import { INestApplication, ValidationPipe, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsService } from "./admin-settings.service";
import { MAX_MIN_WITHDRAWAL_RIAL } from "./dto/admin-settings.dto";

/**
 * The split that matters here: an operator manages their own profile and
 * preferences with no permission at all, while the install-wide settings are
 * behind `settings`. Getting that backwards would either lock people out of
 * their own two-factor toggle or let anyone change the platform's withdrawal
 * floor.
 */
describe("AdminSettingsController", () => {
  let app: INestApplication;
  let caller: unknown;

  const service = {
    profile: jest.fn().mockResolvedValue({ id: "a-1" }),
    updateProfile: jest.fn().mockResolvedValue({ id: "a-1" }),
    security: jest.fn().mockResolvedValue({}),
    updateSecurity: jest.fn().mockResolvedValue({}),
    notifications: jest.fn().mockResolvedValue({}),
    updateNotifications: jest.fn().mockResolvedValue({}),
    platformSettings: jest.fn().mockResolvedValue({}),
    updatePlatform: jest.fn().mockResolvedValue({}),
  };

  const admin = (permissions: string[]) => ({
    id: "a-1", isSuspended: false, roleId: "r-1",
    roleRef: { id: "r-1", slug: "custom", permissions },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [AdminSettingsService, AdminPermissionsGuard],
    })
      .overrideProvider(AdminSettingsService)
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
    caller = admin([]);
    jest.clearAllMocks();
  });

  const url = (p: string) => `/api/v1/admin/settings/${p}`;

  it("lets an operator with no permissions at all manage their own settings", async () => {
    for (const path of ["profile", "security", "notifications"]) {
      await request(app.getHttpServer()).get(url(path)).expect(200);
    }
    await request(app.getHttpServer()).patch(url("security")).send({ twoFactor: true }).expect(200);
    await request(app.getHttpServer()).patch(url("notifications")).send({ tradeAlerts: false }).expect(200);
    await request(app.getHttpServer()).patch(url("profile")).send({ fullName: "علی" }).expect(200);
  });

  it("refuses the platform settings to an operator without `settings`", async () => {
    caller = admin(["dashboard", "accounting", "roles_manage"]);
    await request(app.getHttpServer()).get(url("platform")).expect(403);
    await request(app.getHttpServer()).patch(url("platform")).send({ language: "en" }).expect(403);
    expect(service.updatePlatform).not.toHaveBeenCalled();
  });

  it("allows the platform settings to an operator holding `settings`", async () => {
    caller = admin(["settings"]);
    await request(app.getHttpServer()).get(url("platform")).expect(200);
    await request(app.getHttpServer()).patch(url("platform")).send({ language: "en" }).expect(200);
  });

  it("refuses a suspended operator even on their own settings", async () => {
    caller = { ...admin(["settings"]), isSuspended: true };
    await request(app.getHttpServer()).get(url("platform")).expect(403);
  });

  it("validates the platform body before the service sees it", async () => {
    caller = admin(["settings"]);
    for (const body of [
      { language: "de" },
      { calendar: "mayan" },
      { displayCurrency: "USD" },
      { defaultProfitPercent: 101 },
      { minWithdrawal: -1 },
      { minWithdrawal: MAX_MIN_WITHDRAWAL_RIAL + 1 },
    ]) {
      await request(app.getHttpServer()).patch(url("platform")).send(body).expect(400);
    }
    expect(service.updatePlatform).not.toHaveBeenCalled();
  });

  it("accepts a numeric string for a numeric field, as a form would send it", async () => {
    caller = admin(["settings"]);
    await request(app.getHttpServer()).patch(url("platform")).send({ minWithdrawal: "5000000" }).expect(200);
    expect(service.updatePlatform).toHaveBeenCalledWith({ minWithdrawal: 5_000_000 });
  });

  it("rejects an email that is not one", async () => {
    await request(app.getHttpServer()).patch(url("profile")).send({ email: "nope" }).expect(400);
  });
});
