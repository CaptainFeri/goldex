import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminSettingsService } from "./admin-settings.service";
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

@ApiTags("Admin-Settings")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  // The first three are the caller's own settings and deliberately require no
  // permission: an operator manages their own profile and preferences, and
  // gating them would mean a role could be configured such that nobody can
  // turn on their own two-factor.

  @Get("profile")
  @ApiOperation({ summary: "The signed-in admin's profile" })
  @ApiEnvelopeResponse(AdminProfileDto)
  async profile(@Req() req: AdminExpressRequest) {
    return { data: await this.settings.profile(req.admin) };
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update the signed-in admin's profile" })
  @ApiEnvelopeResponse(AdminProfileDto)
  async updateProfile(@Req() req: AdminExpressRequest, @Body() dto: UpdateProfileDto) {
    return { data: await this.settings.updateProfile(req.admin, dto) };
  }

  @Get("security")
  @ApiOperation({ summary: "The caller's own security preferences" })
  @ApiEnvelopeResponse(SecuritySettingsDto)
  async security(@Req() req: AdminExpressRequest) {
    return { data: await this.settings.security(req.admin) };
  }

  @Patch("security")
  @ApiOperation({ summary: "Update the caller's own security preferences" })
  @ApiEnvelopeResponse(SecuritySettingsDto)
  async updateSecurity(@Req() req: AdminExpressRequest, @Body() dto: UpdateSecuritySettingsDto) {
    return { data: await this.settings.updateSecurity(req.admin, dto) };
  }

  @Get("notifications")
  @ApiOperation({ summary: "The caller's own notification preferences" })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  async notifications(@Req() req: AdminExpressRequest) {
    return { data: await this.settings.notifications(req.admin) };
  }

  @Patch("notifications")
  @ApiOperation({ summary: "Update the caller's own notification preferences" })
  @ApiEnvelopeResponse(NotificationSettingsDto)
  async updateNotifications(@Req() req: AdminExpressRequest, @Body() dto: UpdateNotificationSettingsDto) {
    return { data: await this.settings.updateNotifications(req.admin, dto) };
  }

  @Get("platform")
  @RequirePermissions("settings")
  @ApiOperation({
    summary: "Install-wide settings",
    description: "Global, not per-admin — gated behind `settings`, which only the root role holds by default.",
  })
  @ApiEnvelopeResponse(PlatformSettingsDto)
  async platform() {
    return { data: await this.settings.platformSettings() };
  }

  @Patch("platform")
  @RequirePermissions("settings")
  @ApiOperation({
    summary: "Update install-wide settings",
    description: "`minWithdrawal` is rial, like every other amount on the wire.",
  })
  @ApiEnvelopeResponse(PlatformSettingsDto)
  async updatePlatform(@Body() dto: UpdatePlatformSettingsDto) {
    return { data: await this.settings.updatePlatform(dto) };
  }
}
