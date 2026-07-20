import { Controller, Get, Patch, Body, Param, Query, UseGuards, Req } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { DepositService } from "./deposit.service";
import { DepositQueryDto } from "./dto/deposit-query.dto";
import { ProcessDepositDto } from "./dto/process-deposit.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Deposit")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/deposit")
export class DepositAdminController {
  constructor(private readonly depositService: DepositService) {}

  @Get()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "List all deposits (admin)" })
  async findAll(@Query() query: DepositQueryDto) {
    return { data: await this.depositService.findAll(query) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Get deposit details (admin)" })
  async findOne(@Param("id") id: string) {
    return { data: await this.depositService.findById(id) };
  }

  @Patch(":id/process")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Approve or reject a deposit" })
  async process(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: ProcessDepositDto) {
    const adminId = req.admin?.id || "system";
    return { data: await this.depositService.process(adminId, id, dto) };
  }
}
