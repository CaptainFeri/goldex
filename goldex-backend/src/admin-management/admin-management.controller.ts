import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeNoDataResponse,
  ApiEnvelopeResponse,
} from "../shared/swagger";
import { AdminAccountDto } from "../admin-management/dto/admin-account.dto";
import { AdminManagementService } from "../admin-management/admin-management.service";
import { CreateAdminDto } from "../admin-management/dto/create-admin.dto";
import { SuspendAdminDto } from "../admin-management/dto/suspend-admin.dto";
import { UpdateAdminDto } from "../admin-management/dto/update-admin.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";

/**
 * Admin accounts.
 *
 * Gated on `roles_manage`: creating an account now places it in a role, so this
 * controller can grant permissions and has to be held to the same key as the
 * roles screen. `@AdminRoles(SUPER_ADMIN)` below is the legacy declaration and
 * is left where it is, but it enforces nothing — `AdminRolesGuard` reads the
 * metadata key `"roles"` while `@AdminRoles` writes `"AdminRoles"`, and reads
 * `request.user` where the middleware sets `request.admin`. Hierarchy is still
 * checked inside the service, off `admin.role`.
 */
@Controller("admin/accounts")
@ApiTags("Admin-Management")
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions("roles_manage")
export class AdminManagementController {
  constructor(private readonly adminService: AdminManagementService) {}

  @Get()
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List admin accounts" })
  @ApiQuery({ name: "role", enum: AdminRole, required: false })
  @ApiQuery({ name: "suspended", required: false, description: '"true" or "false"' })
  @ApiEnvelopeResponse(AdminAccountDto, { isArray: true })
  async findAll(@Query("role") role?: AdminRole, @Query("suspended") suspended?: string) {
    const filters = {
      role,
      isSuspended: suspended ? suspended === "true" : undefined,
    };

    const admins = await this.adminService.findAll(filters);
    return { data: admins.map(({ hashPassword, ...admin }) => admin) };
  }

  @Post()
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create an admin account" })
  @ApiEnvelopeResponse(AdminAccountDto, { status: 201 })
  async create(@Body() createAdminDto: CreateAdminDto, @Req() req: any) {
    const admin = await this.adminService.create(createAdminDto, req.admin);
    const { hashPassword, ...result } = admin;
    return { data: result };
  }

  @Get(":id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get one admin account" })
  @ApiEnvelopeResponse(AdminAccountDto)
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const { hashPassword, ...admin } = await this.adminService.findOne(id);
    return { data: admin };
  }

  @Patch(":id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Edit an admin account" })
  @ApiEnvelopeResponse(AdminAccountDto)
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() updateAdminDto: UpdateAdminDto, @Req() req: any) {
    const { hashPassword, ...admin } = await this.adminService.update(id, updateAdminDto, req.admin);
    return { data: admin };
  }

  @Delete(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Soft-delete an admin account" })
  @ApiEnvelopeNoDataResponse({ description: "Deleted; the envelope's data is null" })
  async remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return { data: await this.adminService.remove(id, req.admin) };
  }

  @Patch(":id/suspend")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Suspend or reinstate an admin account" })
  @ApiEnvelopeResponse(AdminAccountDto)
  async suspend(@Param("id", ParseUUIDPipe) id: string, @Body() suspendAdminDto: SuspendAdminDto, @Req() req: any) {
    const { hashPassword, ...admin } = await this.adminService.suspendAdmin(id, suspendAdminDto, req.admin);
    return { data: admin };
  }
}
