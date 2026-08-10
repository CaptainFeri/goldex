import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminUserService } from "./admin-user.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { AssignMarketTypesDto } from "./dto/assign-market-types.dto";
import { AssignMarketKindsDto } from "./dto/assign-market-kinds.dto";
import { ChangeUserRoleDto } from "./dto/change-user-role.dto";

@Controller("admin/users")
@ApiTags("Admin-User")
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Post("partners")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a partner user (mobile, optional activation expiry)" })
  async createPartner(@Body() dto: CreatePartnerDto) {
    const partner = await this.adminUserService.createPartner(dto);
    const { password, ...safe } = partner as any;
    return { data: safe };
  }

  @Get("stats")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "User KPIs (by role, active/inactive, online, blocks, KYC, new)" })
  async stats(@Query("from") from?: string, @Query("to") to?: string) {
    const ts = (v?: string) => {
      if (!v) return undefined;
      const n = Number(v);
      if (!Number.isNaN(n) && n > 0) return n;
      const d = Date.parse(v);
      return Number.isNaN(d) ? undefined : d;
    };
    return { data: await this.adminUserService.getUserStats(ts(from), ts(to)) };
  }

  @Get("online")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "IDs of currently-online users" })
  async online() {
    return { data: await this.adminUserService.onlineUserIds() };
  }

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

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Put("users/:id/market-types")
  @ApiOperation({ summary: "Assign market types a user can see (replaces existing)" })
  async assignUserMarketTypes(@Param("id") id: string, @Body() dto: AssignMarketTypesDto) {
    return {
      data: await this.adminUserService.assignUserMarketTypes(id, dto.marketTypes),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id/market-types")
  @ApiOperation({ summary: "Get market types a user can see" })
  async getUserMarketTypes(@Param("id") id: string) {
    return {
      data: await this.adminUserService.getUserMarketTypes(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Put("users/:id/market-kinds")
  @ApiOperation({ summary: "Assign market kinds a user can trade on (replaces existing)" })
  async assignUserMarketKinds(@Param("id") id: string, @Body() dto: AssignMarketKindsDto) {
    return {
      data: await this.adminUserService.assignUserMarketKinds(id, dto.marketKinds),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id/market-kinds")
  @ApiOperation({ summary: "Get market kinds a user can trade on" })
  async getUserMarketKinds(@Param("id") id: string) {
    return {
      data: await this.adminUserService.getUserMarketKinds(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Patch("users/:id/role")
  @ApiOperation({ summary: "Change a user's role (CUSTOMER <-> PARTNER)" })
  async changeUserRole(@Param("id") id: string, @Body() dto: ChangeUserRoleDto) {
    return {
      data: await this.adminUserService.changeUserRole(id, dto.role),
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
