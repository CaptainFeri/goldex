import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ManagerAccountService } from "./manager-account.service";
import { CreateFundingRequestDto } from "./dto/create-funding-request.dto";
import { ReviewFundingRequestDto } from "./dto/review-funding-request.dto";
import { UpdateAccountStatusDto } from "./dto/update-account-status.dto";
import { ManagerFundingStatusEnum } from "./enum/manager-account.enums";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Manager-Accounts")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/manager-accounts")
export class ManagerAccountController {
  constructor(private readonly service: ManagerAccountService) {}

  @Get()
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Manager trading accounts and their frozen allocations" })
  async list(@Query("adminId") adminId?: string, @Query("symbolId") symbolId?: string) {
    return { data: await this.service.listAccounts({ adminId, symbolId }) };
  }

  @Get("funding")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Funding requests awaiting or past senior-admin review" })
  async listFunding(@Query("status") status?: ManagerFundingStatusEnum, @Query("adminId") adminId?: string) {
    return { data: await this.service.listFundingRequests({ status, adminId }) };
  }

  @Post("funding")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Request that a manager's account be charged or unwound" })
  async requestFunding(@Body() dto: CreateFundingRequestDto, @Req() req: AdminExpressRequest) {
    return { data: await this.service.requestFunding(dto, this.adminId(req)) };
  }

  @Patch("funding/:id/review")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Senior-admin approval or rejection of a funding request" })
  async reviewFunding(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewFundingRequestDto,
    @Req() req: AdminExpressRequest
  ) {
    // The senior-admin check lives in the service, not only in the route
    // decorator, so approval cannot be reached through any other caller.
    const admin = this.admin(req);
    return { data: await this.service.reviewFunding(id, dto, { id: admin.id, role: admin.role }) };
  }

  @Patch("funding/:id/cancel")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Withdraw a funding request you raised" })
  async cancelFunding(@Param("id", ParseUUIDPipe) id: string, @Req() req: AdminExpressRequest) {
    return { data: await this.service.cancelFunding(id, this.adminId(req)) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  async get(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.service.getAccount(id) };
  }

  @Get(":id/ledger")
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Every movement on the account, newest first" })
  async ledger(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.service.getLedger(id, limit, offset) };
  }

  @Patch(":id/status")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Suspend or reactivate a manager account" })
  async setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAccountStatusDto) {
    return { data: await this.service.setAccountStatus(id, dto.status, dto.note) };
  }

  private admin(req: AdminExpressRequest) {
    const admin = (req as any).admin;
    if (!admin?.id) throw new UnauthorizedException("FORBIDDEN");
    return admin;
  }

  private adminId(req: AdminExpressRequest): string {
    return this.admin(req).id;
  }
}
