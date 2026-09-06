import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeNoDataResponse, ApiEnvelopeResponse } from "../shared/swagger";
import { ApiKeyService } from "./api-key.service";
import {
  ApiKeyDto,
  ApiStatsDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  TrafficDto,
  TrafficQueryDto,
  UpdateApiKeyStatusDto,
} from "./dto/api-key.dto";

@ApiTags("Admin-API-Keys")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions("api")
@Controller("admin")
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get("api/stats")
  @ApiOperation({
    summary: "API traffic headline figures, for today",
    description:
      "Averages and rates are null when there was no traffic — a 100% success rate over zero " +
      "requests would read as healthy. `keyedRouteCount` says whether any route accepts a key at all.",
  })
  @ApiEnvelopeResponse(ApiStatsDto)
  async stats() {
    return { data: await this.keys.stats() };
  }

  @Get("api/traffic")
  @ApiOperation({
    summary: "Hourly traffic series",
    description: "Every hour in the window is returned, including empty ones.",
  })
  @ApiEnvelopeResponse(TrafficDto)
  async traffic(@Query() query: TrafficQueryDto) {
    return { data: await this.keys.traffic(query.window ?? "24h") };
  }

  @Get("api-keys")
  @ApiOperation({ summary: "Every API key, masked" })
  @ApiEnvelopeResponse(ApiKeyDto, { isArray: true })
  async list() {
    return { data: await this.keys.list() };
  }

  @Post("api-keys")
  @ApiOperation({
    summary: "Issue an API key",
    description:
      "The response carries the plaintext key. It is not stored and cannot be retrieved again — " +
      "only a hash is kept, so the panel must show it once and say so.",
  })
  @ApiEnvelopeResponse(CreatedApiKeyDto, { status: 201 })
  async create(@Req() req: AdminExpressRequest, @Body() dto: CreateApiKeyDto) {
    return { data: await this.keys.create(dto, req.admin?.id ?? null) };
  }

  @Patch("api-keys/:id/status")
  @ApiOperation({ summary: "Activate, limit, or revoke a key" })
  @ApiEnvelopeResponse(ApiKeyDto)
  async updateStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateApiKeyStatusDto) {
    return { data: await this.keys.updateStatus(id, dto) };
  }

  @Delete("api-keys/:id")
  @HttpCode(200)
  @ApiOperation({
    summary: "Delete a key",
    description: "Soft delete: the traffic it already generated stays in the history.",
  })
  @ApiEnvelopeNoDataResponse()
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.keys.remove(id);
    return { data: null };
  }
}
