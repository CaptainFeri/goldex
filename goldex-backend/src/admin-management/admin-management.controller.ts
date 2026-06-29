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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminManagementService } from "../admin-management/admin-management.service";
import { CreateAdminDto } from "../admin-management/dto/create-admin.dto";
import { SuspendAdminDto } from "../admin-management/dto/suspend-admin.dto";
import { UpdateAdminDto } from "../admin-management/dto/update-admin.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@Controller("admin")
@ApiTags("Admin-Management")
export class AdminManagementController {
  constructor(private readonly adminService: AdminManagementService) {}

  @Post()
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  async create(@Body() createAdminDto: CreateAdminDto, @Req() req: any) {
    const admin = await this.adminService.create(createAdminDto, req.admin?.id);
    const { hashPassword, ...result } = admin;
    return { data: result };
  }

  @Get()
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  async findAll(@Query("role") role?: AdminRole, @Query("suspended") suspended?: string) {
    const filters = {
      role,
      isSuspended: suspended ? suspended === "true" : undefined,
    };

    const admins = await this.adminService.findAll(filters);
    return { data: admins.map(({ hashPassword, ...admin }) => admin) };
  }

  @Get(":id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const { hashPassword, ...admin } = await this.adminService.findOne(id);
    return { data: admin };
  }

  @Patch(":id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() updateAdminDto: UpdateAdminDto, @Req() req: any) {
    const { hashPassword, ...admin } = await this.adminService.update(id, updateAdminDto, req.admin);
    return { data: admin };
  }

  @Patch(":id/suspend")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  async suspend(@Param("id", ParseUUIDPipe) id: string, @Body() suspendAdminDto: SuspendAdminDto, @Req() req: any) {
    const { hashPassword, ...admin } = await this.adminService.suspendAdmin(id, suspendAdminDto, req.admin);
    return { data: admin };
  }

  @Delete(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @ApiBearerAuth()
  async remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: any) {
    return { data: await this.adminService.remove(id, req.admin) };
  }
}
