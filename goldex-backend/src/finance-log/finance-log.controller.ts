import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { FinanceLogService } from "./finance-log.service";
import { FinanceLogQueryDto } from "./dto/finance-log-query.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminWorkTimeGuard } from "../admin-schedule/admin-work-time.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Finance-Logs")
@Controller("admin/finance-logs")
@UseGuards(AdminAuthGuard, AdminWorkTimeGuard)
@ApiBearerAuth()
export class FinanceLogController {
  constructor(private readonly financeLogService: FinanceLogService) {}

  @Get()
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Get finance logs with filters" })
  async findAll(@Query() query: FinanceLogQueryDto) {
    return await this.financeLogService.findAll(query);
  }

  @Get("export")
  @AdminRoles(AdminRole.FINANCE, AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: "Export finance logs as Excel" })
  async export(@Query() query: FinanceLogQueryDto, @Res() res: Response) {
    const buffer = await this.financeLogService.exportToExcel(query);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=finance-logs-${new Date().toISOString().split("T")[0]}.xlsx`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  }
}
