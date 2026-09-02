import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminBankAccountService } from "./admin-bank-account.service";
import { CreateAdminBankAccountDto } from "./dto/create-admin-bank-account.dto";
import { UpdateAdminBankAccountDto } from "./dto/update-admin-bank-account.dto";
import { BankAccountQueryDto } from "./dto/bank-account-query.dto";
import { SetDirectionsDto } from "./dto/set-directions.dto";
import { SetBankAccountStatusDto } from "./dto/set-status.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-BankAccounts")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/bank-accounts")
export class AdminBankAccountController {
  constructor(private readonly service: AdminBankAccountService) {}

  @Get()
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List company bank accounts" })
  async findAll(@Query() query: BankAccountQueryDto) {
    return { data: await this.service.findAll(query) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.FINANCE, AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get one company bank account" })
  async findOne(@Param("id") id: string) {
    return { data: await this.service.findById(id) };
  }

  @Post()
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a company bank account" })
  async create(@Body() dto: CreateAdminBankAccountDto) {
    return { data: await this.service.create(dto) };
  }

  @Patch(":id")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Edit a company bank account" })
  async update(@Param("id") id: string, @Body() dto: UpdateAdminBankAccountDto) {
    return { data: await this.service.update(id, dto) };
  }

  @Patch(":id/directions")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Enable this account for deposit, withdraw, both, or neither" })
  async setDirections(@Param("id") id: string, @Body() dto: SetDirectionsDto) {
    return { data: await this.service.setDirections(id, dto) };
  }

  @Patch(":id/status")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Activate or deactivate (accounts are never deleted)" })
  async setStatus(@Param("id") id: string, @Body() dto: SetBankAccountStatusDto) {
    return { data: await this.service.setStatus(id, dto.status) };
  }

}
