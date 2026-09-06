import { BadRequestException, ConflictException } from "@nestjs/common";
import { AdminSettingsService, isValidTimezone } from "./admin-settings.service";

const ADMIN = { id: "a-1" } as any;

function build(adminRow: any = { id: "a-1", email: "a@x.io", phone: "0912", fullName: null }, settingsRow: any = null) {
  const state = { settings: settingsRow, admins: [adminRow, { id: "a-2", email: "taken@x.io" }], platform: {
    singleton: true, displayCurrency: "TOMAN", language: "fa", timezone: "Asia/Tehran",
    calendar: "jalali", minWithdrawal: "0", defaultProfitPercent: "0", updateAt: new Date(),
  } as any, created: 0 };

  const settings = {
    findOne: jest.fn(async () => state.settings),
    create: jest.fn((v: any) => ({
      twoFactor: false, biometric: false, unknownLoginAlert: true,
      tradeAlerts: true, dailyEmailReport: false, systemAlerts: true, ...v,
    })),
    save: jest.fn(async (v: any) => {
      if (!state.settings) state.created++;
      state.settings = { ...state.settings, ...v };
      return state.settings;
    }),
  };
  const platform = {
    findOne: jest.fn(async () => state.platform),
    save: jest.fn(async (v: any) => (state.platform = { ...state.platform, ...v })),
  };
  const admins = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.email !== undefined) {
        // Models the `Not(id)` exclusion the service passes.
        return state.admins.find((a) => a.email === where.email && a.id !== adminRow.id) ?? null;
      }
      return state.admins.find((a) => a.id === where.id) ?? null;
    }),
    save: jest.fn(async (v: any) => {
      const i = state.admins.findIndex((a) => a.id === v.id);
      state.admins[i] = { ...state.admins[i], ...v };
      return state.admins[i];
    }),
  };
  return { service: new AdminSettingsService(settings as any, platform as any, admins as any), state };
}

describe("isValidTimezone", () => {
  it("accepts zones the runtime knows", () => {
    expect(isValidTimezone("Asia/Tehran")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects anything ICU does not recognise, rather than trusting a hardcoded list", () => {
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("Asia/Teheran")).toBe(false);
  });
});

describe("AdminSettingsService per-admin", () => {
  it("creates the settings row on first read and reuses it after", async () => {
    const { service, state } = build();
    await service.security(ADMIN);
    await service.notifications(ADMIN);
    expect(state.created).toBe(1);
  });

  it("uses the documented defaults for a fresh row", async () => {
    const { service } = build();
    expect(await service.security(ADMIN)).toEqual({
      twoFactor: false, biometric: false, unknownLoginAlert: true,
    });
    expect(await service.notifications(ADMIN)).toEqual({
      tradeAlerts: true, dailyEmailReport: false, systemAlerts: true,
    });
  });

  it("changes only the toggle it was given", async () => {
    const { service } = build();
    await service.updateSecurity(ADMIN, { twoFactor: true });
    expect(await service.security(ADMIN)).toEqual({
      twoFactor: true, biometric: false, unknownLoginAlert: true,
    });
  });

  it("treats an explicit false as a change, not as absent", async () => {
    // `if (dto.x)` instead of `!== undefined` would make turning something off
    // silently do nothing.
    const { service } = build();
    await service.updateNotifications(ADMIN, { tradeAlerts: false, systemAlerts: false });
    expect(await service.notifications(ADMIN)).toEqual({
      tradeAlerts: false, dailyEmailReport: false, systemAlerts: false,
    });
  });

  it("refuses an email another admin already holds", async () => {
    const { service } = build();
    await expect(service.updateProfile(ADMIN, { email: "taken@x.io" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("allows saving the caller's own unchanged email", async () => {
    const { service } = build();
    await expect(service.updateProfile(ADMIN, { email: "a@x.io" })).resolves.toBeDefined();
  });
});

describe("AdminSettingsService platform", () => {
  it("rejects an unknown timezone and keeps the old one", async () => {
    const { service, state } = build();
    await expect(service.updatePlatform({ timezone: "Mars/Olympus" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(state.platform.timezone).toBe("Asia/Tehran");
  });

  it("stores minWithdrawal as given — rial, not toman", async () => {
    const { service } = build();
    const out = await service.updatePlatform({ minWithdrawal: 5_000_000 });
    expect(out.minWithdrawal).toBe("5000000");
  });

  it("treats zero as a value rather than as absent", async () => {
    const { service } = build();
    const out = await service.updatePlatform({ minWithdrawal: 0, defaultProfitPercent: 0 });
    expect(out.minWithdrawal).toBe("0");
    expect(out.defaultProfitPercent).toBe("0");
  });

  it("leaves untouched fields alone", async () => {
    const { service } = build();
    const out = await service.updatePlatform({ language: "en" });
    expect(out.language).toBe("en");
    expect(out.calendar).toBe("jalali");
    expect(out.displayCurrency).toBe("TOMAN");
  });
});
