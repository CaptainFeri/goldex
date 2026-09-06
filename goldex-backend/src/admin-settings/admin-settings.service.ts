import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Not, Repository } from "typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { permissionsOf } from "../admin-role/guard/admin-permissions.guard";
import { AdminSettingsEntity } from "./entity/admin-settings.entity";
import { PlatformSettingsEntity } from "./entity/platform-settings.entity";
import {
  AdminProfileDto,
  NotificationSettingsDto,
  PlatformSettingsDto,
  SecuritySettingsDto,
  UpdateNotificationSettingsDto,
  UpdatePlatformSettingsDto,
  UpdateProfileDto,
  UpdateSecuritySettingsDto,
} from "./dto/admin-settings.dto";

/** Is this a zone this runtime actually knows? */
export function isValidTimezone(zone: string): boolean {
  try {
    // Throws RangeError for anything ICU does not recognise, which is a far
    // better check than a hardcoded list that goes stale.
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectRepository(AdminSettingsEntity) private readonly settings: Repository<AdminSettingsEntity>,
    @InjectRepository(PlatformSettingsEntity) private readonly platform: Repository<PlatformSettingsEntity>,
    @InjectRepository(AdminEntity) private readonly admins: Repository<AdminEntity>,
  ) {}

  // ── Per-admin ───────────────────────────────────────────────────────────

  async profile(admin: AdminEntity): Promise<AdminProfileDto> {
    const row = await this.admins.findOne({ where: { id: admin.id }, relations: { roleRef: true } });
    if (!row) throw new NotFoundException("ADMIN.NOT_FOUND");
    return {
      id: row.id,
      fullName: row.fullName ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      roleName: row.roleRef?.roleName ?? null,
      permissions: permissionsOf(row),
      lastLoginAt: row.lastLoginAt ?? null,
    };
  }

  async updateProfile(admin: AdminEntity, dto: UpdateProfileDto): Promise<AdminProfileDto> {
    const row = await this.admins.findOne({ where: { id: admin.id } });
    if (!row) throw new NotFoundException("ADMIN.NOT_FOUND");

    if (dto.email !== undefined && dto.email !== row.email) {
      // `email` is unique; without this the database rejects it with a
      // constraint name, which reaches the operator as a 500.
      const taken = await this.admins.findOne({ where: { email: dto.email, id: Not(row.id) } });
      if (taken) throw new ConflictException("ADMIN.EMAIL_TAKEN");
      row.email = dto.email;
    }
    if (dto.fullName !== undefined) row.fullName = dto.fullName;

    await this.admins.save(row);
    return this.profile(admin);
  }

  async security(admin: AdminEntity): Promise<SecuritySettingsDto> {
    const s = await this.mine(admin.id);
    return { twoFactor: s.twoFactor, biometric: s.biometric, unknownLoginAlert: s.unknownLoginAlert };
  }

  async updateSecurity(admin: AdminEntity, dto: UpdateSecuritySettingsDto): Promise<SecuritySettingsDto> {
    const s = await this.mine(admin.id);
    if (dto.twoFactor !== undefined) s.twoFactor = dto.twoFactor;
    if (dto.biometric !== undefined) s.biometric = dto.biometric;
    if (dto.unknownLoginAlert !== undefined) s.unknownLoginAlert = dto.unknownLoginAlert;
    await this.settings.save(s);
    return this.security(admin);
  }

  async notifications(admin: AdminEntity): Promise<NotificationSettingsDto> {
    const s = await this.mine(admin.id);
    return { tradeAlerts: s.tradeAlerts, dailyEmailReport: s.dailyEmailReport, systemAlerts: s.systemAlerts };
  }

  async updateNotifications(
    admin: AdminEntity,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    const s = await this.mine(admin.id);
    if (dto.tradeAlerts !== undefined) s.tradeAlerts = dto.tradeAlerts;
    if (dto.dailyEmailReport !== undefined) s.dailyEmailReport = dto.dailyEmailReport;
    if (dto.systemAlerts !== undefined) s.systemAlerts = dto.systemAlerts;
    await this.settings.save(s);
    return this.notifications(admin);
  }

  // ── Install-wide ────────────────────────────────────────────────────────

  async platformSettings(): Promise<PlatformSettingsDto> {
    const row = await this.singleton();
    return {
      displayCurrency: row.displayCurrency,
      language: row.language,
      timezone: row.timezone,
      calendar: row.calendar,
      minWithdrawal: String(row.minWithdrawal),
      defaultProfitPercent: String(row.defaultProfitPercent),
      updateAt: row.updateAt ?? null,
    };
  }

  async updatePlatform(dto: UpdatePlatformSettingsDto): Promise<PlatformSettingsDto> {
    const row = await this.singleton();

    if (dto.timezone !== undefined) {
      if (!isValidTimezone(dto.timezone)) throw new BadRequestException("SETTINGS.UNKNOWN_TIMEZONE");
      row.timezone = dto.timezone;
    }
    if (dto.displayCurrency !== undefined) row.displayCurrency = dto.displayCurrency;
    if (dto.language !== undefined) row.language = dto.language;
    if (dto.calendar !== undefined) row.calendar = dto.calendar;
    if (dto.minWithdrawal !== undefined) row.minWithdrawal = String(dto.minWithdrawal);
    if (dto.defaultProfitPercent !== undefined) row.defaultProfitPercent = String(dto.defaultProfitPercent);

    await this.platform.save(row);
    return this.platformSettings();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** The caller's own settings row, created on first read rather than at signup. */
  private async mine(adminId: string): Promise<AdminSettingsEntity> {
    const existing = await this.settings.findOne({ where: { adminId } });
    if (existing) return existing;
    return this.settings.save(this.settings.create({ adminId }));
  }

  private async singleton(): Promise<PlatformSettingsEntity> {
    const row = await this.platform.findOne({ where: { singleton: true } });
    // The migration seeds this row; its absence means a broken install, and
    // inventing defaults here would hide that.
    if (!row) throw new NotFoundException("SETTINGS.PLATFORM_ROW_MISSING");
    return row;
  }
}
