import { Controller, Get, Post, Param, Body, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { NotificationService } from "./notification.service";
import { NotificationTypeEnum } from "./enum/notification-type.enum";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";
import { NotificationCategoryEnum } from "./enum/notification-category.enum";
import { NotificationStatusEnum } from "./enum/notification-status.enum";
import { NotificationBroadcastService } from "./notification-broadcast.service";

class AdminSendNotificationDto {
  userId: string;
  type: NotificationTypeEnum;
  category?: NotificationCategoryEnum;
  title: string;
  body: string;
  channels?: NotificationChannelEnum[];
  userEmail?: string;
  userPhone?: string;
}

@Controller("admin/notifications")
@ApiTags("Admin-Notifications")
export class AdminNotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly broadcastService: NotificationBroadcastService,
  ) {}

  @Get()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all notifications (admin)" })
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "type", required: false, enum: NotificationTypeEnum })
  @ApiQuery({ name: "channel", required: false, enum: NotificationChannelEnum })
  @ApiQuery({ name: "status", required: false, enum: NotificationStatusEnum })
  async listNotifications(
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
    @Query("userId") userId?: string,
    @Query("type") type?: string,
    @Query("channel") channel?: string,
    @Query("status") status?: string,
  ) {
    return { data: await this.notificationService.findAll({ page, limit, userId, type, channel, status }) };
  }

  @Get("stats")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Notification delivery stats" })
  async getStats() {
    return { data: await this.notificationService.getAdminStats() };
  }

  @Post("send")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Send notification to a user" })
  async sendNotification(@Body() dto: AdminSendNotificationDto) {
    return { data: await this.notificationService.create(dto) };
  }

  @Post("send-to-segment")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Broadcast notification to a customer segment" })
  async sendToSegment(@Body() dto: {
    segmentId: string;
    mode?: "dynamic" | "manual";
    type?: NotificationTypeEnum;
    category?: NotificationCategoryEnum;
    title?: string;
    body?: string;
    templateSlug?: string;
    variables?: Record<string, any>;
    channels?: NotificationChannelEnum[];
  }) {
    return { data: await this.broadcastService.sendToSegment(dto) };
  }

  @Get("user/:userId")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiOperation({ summary: "View notifications for a specific user" })
  async getUserNotifications(
    @Param("userId") userId: string,
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    return { data: await this.notificationService.getUserNotifications(userId, page, limit) };
  }
}
