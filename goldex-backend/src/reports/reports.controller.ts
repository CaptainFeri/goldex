import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeNoDataResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../shared/swagger";
import {
  CreateReportScheduleDto,
  GenerateReportDto,
  ReportDownloadDto,
  ReportJobDto,
  ReportQueryDto,
  ReportScheduleDto,
  ReportStatsDto,
  UpdateReportScheduleDto,
} from "./dto/report.dto";
import { ReportCaller, ReportsService } from "./reports.service";

@ApiTags("Admin-Reports")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions("reports")
@Controller("admin/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Who is asking.
   *
   * Every method resolves this the same way, because the visibility rule is
   * applied in the service on every path — list, detail and download alike.
   */
  private caller(req: AdminExpressRequest): ReportCaller {
    return { adminId: req.admin?.id, role: req.admin?.role };
  }

  @Get("stats")
  @ApiOperation({
    summary: "Headline report figures",
    description: "Scoped to the caller: an operator's counts are their own, a super admin's are everyone's.",
  })
  @ApiEnvelopeResponse(ReportStatsDto)
  async stats(@Req() req: AdminExpressRequest) {
    return { data: await this.reports.stats(this.caller(req)) };
  }

  // Declared before `:id` so the literal path is not captured as a UUID.
  @Get("schedules")
  @ApiOperation({ summary: "Report schedules visible to the caller" })
  @ApiEnvelopeResponse(ReportScheduleDto, { isArray: true })
  async listSchedules(@Req() req: AdminExpressRequest) {
    return { data: await this.reports.listSchedules(this.caller(req)) };
  }

  @Post("schedules")
  @ApiOperation({ summary: "Create a report schedule" })
  @ApiEnvelopeResponse(ReportScheduleDto, { status: 201 })
  async createSchedule(@Req() req: AdminExpressRequest, @Body() dto: CreateReportScheduleDto) {
    return { data: await this.reports.createSchedule(this.caller(req), dto) };
  }

  @Patch("schedules/:id")
  @ApiOperation({
    summary: "Update a report schedule",
    description: "The report type is fixed at creation, so the run history keeps meaning what it says.",
  })
  @ApiEnvelopeResponse(ReportScheduleDto)
  async updateSchedule(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateReportScheduleDto,
  ) {
    return { data: await this.reports.updateSchedule(this.caller(req), id, dto) };
  }

  @Delete("schedules/:id")
  @HttpCode(200)
  @ApiOperation({ summary: "Delete a report schedule" })
  @ApiEnvelopeNoDataResponse()
  async removeSchedule(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    await this.reports.removeSchedule(this.caller(req), id);
    return { data: null };
  }

  @Get()
  @ApiOperation({
    summary: "Reports visible to the caller",
    description: "`kpi` selects the panel's four views: generated, schedules, downloads, duration.",
  })
  @ApiPaginatedResponse(ReportJobDto)
  async list(@Req() req: AdminExpressRequest, @Query() query: ReportQueryDto) {
    return { data: await this.reports.list(this.caller(req), query) };
  }

  @Post("generate")
  @ApiOperation({
    summary: "Queue a report",
    description:
      "Returns immediately with a pending job; a sweep generates it. Poll `GET /admin/reports/{id}` " +
      "until the status is completed, then take the download URL.",
  })
  @ApiEnvelopeResponse(ReportJobDto, { status: 201 })
  async generate(@Req() req: AdminExpressRequest, @Body() dto: GenerateReportDto) {
    return { data: await this.reports.enqueue(this.caller(req), dto) };
  }

  @Get(":id")
  @ApiOperation({
    summary: "One report's status",
    description: "404 rather than 403 to a non-owner, so an id cannot be used to confirm a report exists.",
  })
  @ApiEnvelopeResponse(ReportJobDto)
  async findOne(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.reports.findOne(this.caller(req), id) };
  }

  @Get(":id/download")
  @ApiOperation({
    summary: "Mint a download URL for a completed report",
    description:
      "Ownership is re-checked here, not trusted from the list. The URL is short-lived, carries its " +
      "own authorization and needs no bearer token; every call is recorded against the caller.",
  })
  @ApiEnvelopeResponse(ReportDownloadDto)
  async download(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.reports.download(this.caller(req), id) };
  }
}
