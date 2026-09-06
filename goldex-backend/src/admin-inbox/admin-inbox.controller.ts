import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AdminNotificationGateway } from "../notification/admin-notification.gateway";
import { ApiAdminErrorResponses, ApiEnvelopeResponse, ApiPaginatedResponse } from "../shared/swagger";
import { AdminInboxService } from "./admin-inbox.service";
import {
  InboxItemDto,
  InboxQueryDto,
  InboxStatsDto,
  MarkedReadDto,
  UnreadCountDto,
} from "./dto/admin-inbox.dto";

/**
 * The operators' inbox.
 *
 * Mounted at `admin/notifications/inbox`, not at `admin/notifications` as the
 * plan wrote it: that prefix already belongs to the outbound notification
 * controller, where `GET /admin/notifications/stats` means "delivery stats for
 * messages sent to users". Taking that path for inbox stats would have
 * shadowed a working endpoint with something that answers a different
 * question.
 *
 * No permission is required to read your own inbox — every operator has one.
 * Individual items can carry a `requiredPermission`, and the service filters
 * on it, so a warehouse operator is not shown withdrawal approvals.
 */
@ApiTags("Admin-Inbox")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard)
@Controller("admin/notifications/inbox")
export class AdminInboxController {
  constructor(
    private readonly inbox: AdminInboxService,
    private readonly gateway: AdminNotificationGateway,
  ) {}

  @Get("unread-count")
  @ApiOperation({ summary: "Unread items visible to the caller", description: "Drives the sidebar badge." })
  @ApiEnvelopeResponse(UnreadCountDto)
  async unreadCount(@Req() req: AdminExpressRequest) {
    return { data: await this.inbox.unreadCount(req.admin) };
  }

  @Get("stats")
  @ApiOperation({
    summary: "Inbox counters",
    description: "Also reports whether the websocket feed is up, so the UI need not imply live updates.",
  })
  @ApiEnvelopeResponse(InboxStatsDto)
  async stats(@Req() req: AdminExpressRequest) {
    return { data: await this.inbox.stats(req.admin, this.gateway) };
  }

  @Patch("read-all")
  @HttpCode(200)
  @ApiOperation({
    summary: "Mark every visible unread item as read",
    description: "Scoped to what the caller can see; it never clears items that were not in their inbox.",
  })
  @ApiEnvelopeResponse(MarkedReadDto)
  async markAllRead(@Req() req: AdminExpressRequest) {
    return { data: await this.inbox.markAllRead(req.admin) };
  }

  @Get()
  @ApiOperation({
    summary: "The inbox, newest first",
    description: "`isRead` is per-caller: one operator reading an item does not clear it for anyone else.",
  })
  @ApiPaginatedResponse(InboxItemDto)
  async list(@Req() req: AdminExpressRequest, @Query() query: InboxQueryDto) {
    return { data: await this.inbox.inbox(req.admin, query) };
  }

  @Patch(":id/read")
  @HttpCode(200)
  @ApiOperation({ summary: "Mark one item read", description: "Idempotent." })
  @ApiEnvelopeResponse(MarkedReadDto)
  async markRead(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.inbox.markRead(req.admin, id) };
  }
}
