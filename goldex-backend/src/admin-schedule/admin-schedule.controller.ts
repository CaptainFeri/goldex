import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AdminScheduleService } from "./admin-schedule.service";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminWorkTimeGuard } from "./admin-work-time.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Schedule")
@Controller("admin/schedules")
@UseGuards(AdminAuthGuard, AdminWorkTimeGuard)
@ApiBearerAuth()
export class AdminScheduleController {
  constructor(private readonly scheduleService: AdminScheduleService) {}

  @Post()
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create admin work schedule" })
  async create(@Body() dto: CreateScheduleDto) {
    return { data: await this.scheduleService.create(dto) };
  }

  @Get(":adminId")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Get admin work schedules" })
  async findByAdmin(@Param("adminId") adminId: string) {
    return { data: await this.scheduleService.findByAdmin(adminId) };
  }

  @Patch(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update admin work schedule" })
  async update(@Param("id") id: string, @Body() dto: Partial<CreateScheduleDto>) {
    return { data: await this.scheduleService.update(id, dto) };
  }

  @Delete(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Delete admin work schedule" })
  async remove(@Param("id") id: string) {
    await this.scheduleService.remove(id);
    return { message: "Schedule deleted successfully" };
  }
}
