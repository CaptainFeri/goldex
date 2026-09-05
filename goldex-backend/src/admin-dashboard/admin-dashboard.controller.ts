import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminDashboardService } from "./admin-dashboard.service";
import {
  DashboardActivityItemDto,
  DashboardDistributionDto,
  DashboardHealthDto,
  DashboardKpisDto,
  DashboardListQueryDto,
  DashboardMetricQueryDto,
  DashboardRecentDto,
  DashboardSeriesDto,
  DashboardSeriesQueryDto,
} from "./dto/dashboard.dto";

@ApiTags("Admin-Dashboard")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard)
// The landing page: every operator role sees it, and each panel is already
// scoped to what the metric itself exposes.
@AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE, AdminRole.WAREHOUSE)
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get("kpis")
  @ApiOperation({
    summary: "All four KPI cards",
    description:
      "Returned together because the panel shows them together and any one of them can be the " +
      "active filter. Amounts are in `unit`'s own terms — the API never converts.",
  })
  @ApiEnvelopeResponse(DashboardKpisDto)
  async kpis() {
    return { data: await this.dashboard.kpis() };
  }

  @Get("series")
  @ApiOperation({
    summary: "Twelve Jalali months of the selected metric",
    description:
      "Bucketed by Jalali month, not Gregorian — the two do not line up, so a `date_trunc` " +
      "grouping labelled in Persian would put ten days of every month in the wrong bar. Empty " +
      "months are present with zeroes so the axis does not shift.",
  })
  @ApiEnvelopeResponse(DashboardSeriesDto)
  async series(@Query() query: DashboardSeriesQueryDto) {
    return { data: await this.dashboard.series(query.metric, query.year) };
  }

  @Get("distribution")
  @ApiOperation({
    summary: "Pie slices for the selected metric",
    description: "Largest four, with the tail folded into «سایر» so the client never has to drop what it was sent.",
  })
  @ApiEnvelopeResponse(DashboardDistributionDto)
  async distribution(@Query() query: DashboardMetricQueryDto) {
    return { data: await this.dashboard.distribution(query.metric) };
  }

  @Get("activity")
  @ApiOperation({ summary: "Recent activity for the selected metric" })
  @ApiEnvelopeResponse(DashboardActivityItemDto, { isArray: true })
  async activity(@Query() query: DashboardListQueryDto) {
    return { data: await this.dashboard.activity(query.metric, query.limit) };
  }

  @Get("health")
  @ApiOperation({
    summary: "How the last thirty days divide, as percentages",
    description:
      "Composition, not an uptime probe: the platform records no such signal, and a number an " +
      "operator could act on wrongly is worse than none. What this can say truthfully is how the " +
      "recent rows split — completed against failed, waiting against paid.",
  })
  @ApiEnvelopeResponse(DashboardHealthDto)
  async health(@Query() query: DashboardMetricQueryDto) {
    return { data: await this.dashboard.health(query.metric) };
  }

  @Get("recent")
  @ApiOperation({
    summary: "The metric-shaped table",
    description:
      "`columns` names the headers in order and each row's `cells` follow the same order, so one " +
      "component renders all four metrics without switching on which is selected.",
  })
  @ApiEnvelopeResponse(DashboardRecentDto)
  async recent(@Query() query: DashboardListQueryDto) {
    return { data: await this.dashboard.recent(query.metric, query.limit) };
  }
}
