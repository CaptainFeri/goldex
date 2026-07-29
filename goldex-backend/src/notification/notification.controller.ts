import { Controller, Get, Param, Patch, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { Req } from "@nestjs/common";
import { NotificationService } from "./notification.service";

@Controller("notifications")
@ApiTags("Notifications")
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiOperation({ summary: "Get user notifications" })
  async getUserNotifications(
    @Req() req: UserExpressRequest,
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    const userId = req.user.id;
    return { data: await this.notificationService.getUserNotifications(userId, page, limit) };
  }

  @Get("unread-count")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get unread notification count" })
  async getUnreadCount(@Req() req: UserExpressRequest) {
    const userId = req.user.id;
    return { data: { count: await this.notificationService.getUnreadCount(userId) } };
  }

  @Patch(":id/read")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark a notification as read" })
  async markAsRead(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user.id;
    await this.notificationService.markAsRead(id, userId);
    return { data: { success: true } };
  }

  @Patch("read-all")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mark all notifications as read" })
  async markAllAsRead(@Req() req: UserExpressRequest) {
    const userId = req.user.id;
    await this.notificationService.markAllAsRead(userId);
    return { data: { success: true } };
  }
}
