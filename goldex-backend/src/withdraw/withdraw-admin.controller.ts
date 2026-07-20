import { Controller, Get, Patch, Body, Param, Query, UseGuards, Req } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { WithdrawService } from "./withdraw.service";
import { WithdrawQueryDto } from "./dto/withdraw-query.dto";
import { ProcessWithdrawDto } from "./dto/process-withdraw.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Withdraw")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/withdraw")
export class WithdrawAdminController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @Get()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "List all withdrawals (admin)" })
  async findAll(@Query() query: WithdrawQueryDto) {
    return { data: await this.withdrawService.findAll(query) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Get withdrawal details (admin)" })
  async findOne(@Param("id") id: string) {
    return { data: await this.withdrawService.findById(id) };
  }

  @Patch(":id/process")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Approve or reject a withdrawal" })
  async process(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: ProcessWithdrawDto) {
    const adminId = req.admin?.id || "system";
    return { data: await this.withdrawService.process(adminId, id, dto) };
  }
}
