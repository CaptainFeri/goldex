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
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
  ApiEnvelopePrimitiveResponse,
  ApiPaginatedResponse,
} from "../shared/swagger";
import { AdminUserListQueryDto } from "./dto/admin-user-list-query.dto";
import { AdminUserListItemDto, UserRoleChangeDto } from "./dto/admin-user-list-item.dto";
import { AdminUserStatsDto } from "./dto/admin-user-stats.dto";
import { AdminUserDto } from "./dto/admin.user.dto";
import { AdminUserprofileDto } from "./dto/admin.user.profile.dto";
import { AdminUserService } from "./admin-user.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { AssignMarketTypesDto } from "./dto/assign-market-types.dto";
import { AssignMarketKindsDto } from "./dto/assign-market-kinds.dto";
import { ChangeUserRoleDto } from "./dto/change-user-role.dto";
import { SignedFileUrlService } from "../shared/files/signed-file-url.service";
import { withAvatarUrl, withProfileAvatarUrl } from "../shared/files/picture-url.mapper";

@Controller("admin/users")
@ApiTags("Admin-User")
@ApiAdminErrorResponses()
export class AdminUserController {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly signedFileUrlService: SignedFileUrlService,
  ) {}

  @Post("partners")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a partner user (mobile, optional activation expiry)" })
  @ApiEnvelopeResponse(AdminUserListItemDto, { status: 201, description: "The created partner, without its password" })
  async createPartner(@Body() dto: CreatePartnerDto) {
    const partner = await this.adminUserService.createPartner(dto);
    const { password, ...safe } = partner as any;
    return { data: safe };
  }

  @Get("stats")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "User KPIs (by role, active/inactive, online, blocks, KYC, new)" })
  @ApiQuery({ name: "from", required: false, description: "Epoch ms or an ISO date; bounds `newUsers`" })
  @ApiQuery({ name: "to", required: false, description: "Epoch ms or an ISO date" })
  @ApiEnvelopeResponse(AdminUserStatsDto)
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
  @ApiEnvelopePrimitiveResponse("string", { isArray: true, description: "User ids; empty if Redis is unreachable" })
  async online() {
    return { data: await this.adminUserService.onlineUserIds() };
  }

  @Get("users")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Paginated user list, searchable by name or email" })
  @ApiPaginatedResponse(AdminUserListItemDto)
  async getUserList(@Query() query: AdminUserListQueryDto) {
    const page = await this.adminUserService.getUserAdminList(query);
    return {
      data: { ...page, items: page.items.map((u) => withProfileAvatarUrl(this.signedFileUrlService, u)) },
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id")
  @ApiOperation({ summary: "Full profile for one user" })
  @ApiEnvelopeResponse(AdminUserprofileDto)
  async getUserProfile(@Param("id") id: string) {
    return { data: withAvatarUrl(this.signedFileUrlService, await this.adminUserService.getUserProfile(id)) };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Patch("users/:id/activation")
  @ApiOperation({ summary: "Toggle blocked state — blocks an active user, unblocks a blocked one" })
  @ApiEnvelopeResponse(AdminUserDto)
  async switchBlockUnBlockUserById(@Param("id") id: string) {
    return {
      data: await this.adminUserService.switchBlockStatusUserById(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Put("users/:id/market-types")
  @ApiOperation({ summary: "Assign market types a user can see (replaces existing)" })
  @ApiEnvelopePrimitiveResponse("string", { isArray: true, description: "Market types after the call: formal, informal" })
  async assignUserMarketTypes(@Param("id") id: string, @Body() dto: AssignMarketTypesDto) {
    return {
      data: await this.adminUserService.assignUserMarketTypes(id, dto.marketTypes),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id/market-types")
  @ApiOperation({ summary: "Get market types a user can see" })
  @ApiEnvelopePrimitiveResponse("string", { isArray: true, description: "Market types after the call: formal, informal" })
  async getUserMarketTypes(@Param("id") id: string) {
    return {
      data: await this.adminUserService.getUserMarketTypes(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Put("users/:id/market-kinds")
  @ApiOperation({ summary: "Assign market kinds a user can trade on (replaces existing)" })
  @ApiEnvelopePrimitiveResponse("string", { isArray: true, description: "Market kinds after the call: MARKET, LIMIT, OFFER" })
  async assignUserMarketKinds(@Param("id") id: string, @Body() dto: AssignMarketKindsDto) {
    return {
      data: await this.adminUserService.assignUserMarketKinds(id, dto.marketKinds),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Get("users/:id/market-kinds")
  @ApiOperation({ summary: "Get market kinds a user can trade on" })
  @ApiEnvelopePrimitiveResponse("string", { isArray: true, description: "Market kinds after the call: MARKET, LIMIT, OFFER" })
  async getUserMarketKinds(@Param("id") id: string) {
    return {
      data: await this.adminUserService.getUserMarketKinds(id),
    };
  }

  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Patch("users/:id/role")
  @ApiOperation({ summary: "Change a user's role (CUSTOMER <-> PARTNER)" })
  @ApiEnvelopeResponse(UserRoleChangeDto)
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
