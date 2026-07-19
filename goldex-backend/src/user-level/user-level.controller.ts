import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserLevelService } from "./user-level.service";
import { CreateLevelDto } from "./dto/create-level.dto";
import { UpdateLevelDto } from "./dto/update-level.dto";
import { AssignLevelDto } from "./dto/assign-level.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";

@Controller("admin/user-levels")
@ApiTags("Admin-UserLevel")
export class UserLevelController {
  constructor(private readonly levelService: UserLevelService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async findAll() {
    return { data: await this.levelService.findAll() };
  }

  @Get(":id")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async findById(@Param("id") id: string) {
    return { data: await this.levelService.findById(id) };
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async create(@Body() dto: CreateLevelDto) {
    return { data: await this.levelService.create(dto) };
  }

  @Patch(":id")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateLevelDto) {
    return { data: await this.levelService.update(id, dto) };
  }

  @Delete(":id")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async remove(@Param("id") id: string) {
    await this.levelService.remove(id);
    return { data: { success: true } };
  }

  @Post("assign")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async assignLevel(@Body() dto: AssignLevelDto) {
    return { data: await this.levelService.assignLevel(dto) };
  }

  @Post("unassign/:userId")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async unassignLevel(@Param("userId") userId: string) {
    return { data: await this.levelService.unassignLevel(userId) };
  }

  @Get(":id/users")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @ApiQuery({ name: "pageNumber", required: true, type: Number })
  @ApiQuery({ name: "pageSize", required: true, type: Number })
  async getUsersByLevel(
    @Param("id") id: string,
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(100), ParseIntPipe) limit: number = 100,
  ) {
    limit = limit > 100 ? 100 : limit;
    const [users, total] = await this.levelService.getUsersByLevel(id, page, limit);
    return { data: { users, total, page, pageSize: limit } };
  }
}
