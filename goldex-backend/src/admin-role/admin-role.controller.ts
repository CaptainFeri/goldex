import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { ApiAdminErrorResponses, ApiEnvelopeNoDataResponse, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminRoleService } from "./admin-role.service";
import { AdminPermissionsGuard, permissionsOf } from "./guard/admin-permissions.guard";
import { RequirePermissions } from "./guard/require-permissions.decorator";
import {
  AdminRoleDto,
  AssignMembersDto,
  CreateRoleDto,
  PermissionDto,
  RoleMemberDto,
  RoleStatsDto,
  SetPermissionsDto,
  UpdateRoleDto,
} from "./dto/admin-role.dto";

@ApiTags("Admin-Roles")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin")
export class AdminRoleController {
  constructor(private readonly roles: AdminRoleService) {}

  @Get("permissions")
  @RequirePermissions("roles_view")
  @ApiOperation({
    summary: "The permission catalog",
    description: "The panels' own 22 keys with Persian labels, so the role screens stop hardcoding them.",
  })
  @ApiEnvelopeResponse(PermissionDto, { isArray: true })
  async permissions() {
    return { data: this.roles.catalog() };
  }

  @Get("me/permissions")
  @ApiOperation({
    summary: "What the caller holds",
    description:
      "Drives sidebar filtering. Deliberately requires no permission of its own — an operator " +
      "must always be able to discover their own access, or the panel cannot render at all.",
  })
  @ApiEnvelopeResponse(String, { isArray: true })
  async mine(@Req() req: AdminExpressRequest) {
    return { data: permissionsOf(req.admin) };
  }

  @Get("roles/stats")
  @RequirePermissions("roles_view")
  @ApiOperation({ summary: "Role counts" })
  @ApiEnvelopeResponse(RoleStatsDto)
  async stats() {
    return { data: await this.roles.stats() };
  }

  @Get("roles")
  @RequirePermissions("roles_view")
  @ApiOperation({
    summary: "Every role",
    description: "Each carries `capabilities`, so the client greys out what the server would refuse.",
  })
  @ApiEnvelopeResponse(AdminRoleDto, { isArray: true })
  async list(@Req() req: AdminExpressRequest) {
    return { data: await this.roles.list(req.admin) };
  }

  @Post("roles")
  @RequirePermissions("roles_manage")
  @ApiOperation({
    summary: "Create a role",
    description: "The slug is generated, never taken from the request — code keys off it.",
  })
  @ApiEnvelopeResponse(AdminRoleDto, { status: 201 })
  async create(@Req() req: AdminExpressRequest, @Body() dto: CreateRoleDto) {
    return { data: await this.roles.create(req.admin, dto) };
  }

  @Get("roles/:id")
  @RequirePermissions("roles_view")
  @ApiOperation({ summary: "One role, with its configs and pairs" })
  @ApiEnvelopeResponse(AdminRoleDto)
  async findOne(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.roles.findOne(req.admin, id) };
  }

  @Get("roles/:id/members")
  @RequirePermissions("roles_view")
  @ApiOperation({ summary: "Admins assigned to this role" })
  @ApiEnvelopeResponse(RoleMemberDto, { isArray: true })
  async members(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.roles.members(id) };
  }

  @Post("roles/:id/members")
  @HttpCode(200)
  @RequirePermissions("roles_manage")
  @ApiOperation({
    summary: "Move admins into this role",
    description:
      "An admin belongs to exactly one role, so this replaces whatever role each of them was " +
      "in — there is no counterpart that removes an admin from a role, because an admin with " +
      "none holds no permissions at all and suspension is what takes access away deliberately. " +
      "Refused if the role grants a permission the caller does not hold, if the caller names " +
      "themselves, or if it would leave no active admin able to manage roles.",
  })
  @ApiEnvelopeResponse(RoleMemberDto, { isArray: true })
  async assignMembers(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignMembersDto,
  ) {
    return { data: await this.roles.assignMembers(req.admin, id, dto) };
  }

  @Get("roles/:id/permissions")
  @RequirePermissions("roles_view")
  @ApiOperation({ summary: "The keys this role holds" })
  @ApiEnvelopeResponse(String, { isArray: true })
  async rolePermissions(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: (await this.roles.findOne(req.admin, id)).permissions };
  }

  @Put("roles/:id/permissions")
  @HttpCode(200)
  @RequirePermissions("roles_manage")
  @ApiOperation({
    summary: "Replace the role's permission set",
    description:
      "Refused if it would remove `roles_manage` from the caller's own role, grant a key the " +
      "caller does not hold, or leave no active admin able to manage roles.",
  })
  @ApiEnvelopeResponse(AdminRoleDto)
  async setPermissions(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SetPermissionsDto,
  ) {
    return { data: await this.roles.setPermissions(req.admin, id, dto.permissions) };
  }

  @Patch("roles/:id")
  @RequirePermissions("roles_manage")
  @ApiOperation({
    summary: "Update a role",
    description: "A fixed role's name is frozen; its configuration is not. The root role is immutable.",
  })
  @ApiEnvelopeResponse(AdminRoleDto)
  async update(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return { data: await this.roles.update(req.admin, id, dto) };
  }

  @Delete("roles/:id")
  @HttpCode(200)
  @RequirePermissions("roles_manage")
  @ApiOperation({ summary: "Delete a custom role with no members" })
  @ApiEnvelopeNoDataResponse()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.roles.remove(id);
    return { data: null };
  }
}
