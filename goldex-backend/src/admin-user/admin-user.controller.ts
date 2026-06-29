import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminUserService } from "./admin-user.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";

@Controller("admin/users")
@ApiTags("Admin-User")
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get("users")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({
    name: "pageNumber",
    required: true,
    type: Number,
    description: "page number",
  })
  @ApiQuery({
    name: "pageSize",
    required: true,
    type: Number,
    description: "size of page",
  })
  @ApiQuery({
    name: "searchKey",
    required: false,
    type: String,
    description: "Search keyword in` firstname or lastname",
  })
  async getUserList(
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe)
    page: number = 1,
    @Query("pageSize", new DefaultValuePipe(100), ParseIntPipe)
    limit: number = 100,
    @Query("searchKey")
    searchKey: string
  ) {
    limit = limit > 100 ? 100 : limit;
    page = page < 0 ? 1 : page;
    const skip = limit * (page - 1);
    const take = limit;
    return {
      data: await this.adminUserService.getUserAdminList(take, skip, searchKey),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id")
  async getUserProfile(@Param("id") id: string) {
    return {
      data: await this.adminUserService.getUserProfile(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Patch("users/:id/activation")
  async switchBlockUnBlockUserById(@Param("id") id: string) {
    return {
      data: await this.adminUserService.switchBlockStatusUserById(id),
    };
  }

  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // @Get('users/:id/KYC')
  // async getKycByUserId(@Param('id') id: string) {
  //   return {
  //     data: await this.adminUserService.getKycByUserId(id),
  //   };
  // }
}
