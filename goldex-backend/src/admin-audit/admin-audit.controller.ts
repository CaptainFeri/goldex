import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse, ApiPaginatedResponse } from "../shared/swagger";
import { AdminAuditService } from "./admin-audit.service";
import { AuditEntryDto, AuditQueryDto } from "./dto/admin-audit.dto";

/**
 * Read-only, deliberately.
 *
 * There is no endpoint that edits or deletes an entry: a log the recorded
 * parties can amend is not evidence of anything. Retention, when it is
 * decided, belongs in a scheduled job — see docs/ADMIN-AUDIT.md.
 */
@ApiTags("Admin-Audit")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin/audit")
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get("logs")
  @RequirePermissions("monitoring")
  @ApiOperation({
    summary: "Admin mutations, newest first",
    description: "`after` is the request body with credentials redacted; `before` only where a handler recorded one.",
  })
  @ApiPaginatedResponse(AuditEntryDto)
  async list(@Query() query: AuditQueryDto) {
    return { data: await this.audit.list(query) };
  }

  @Get("entity/:entity/:entityId")
  @RequirePermissions("monitoring")
  @ApiOperation({ summary: "Everything recorded against one record" })
  @ApiEnvelopeResponse(AuditEntryDto, { isArray: true })
  async forEntity(@Param("entity") entity: string, @Param("entityId") entityId: string) {
    return { data: await this.audit.forEntity(entity, entityId) };
  }
}
