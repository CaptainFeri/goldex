import { Controller, Get, Patch, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { UserAuthGuard } from "../../user/auth/Guard/user.guard";

@ApiTags("User-Credit")
@Controller("credits")
@UseGuards(UserAuthGuard)
@ApiBearerAuth()
export class CreditUserController {
  constructor(private readonly creditService: CreditService) {}

  @Get("active")
  @ApiOperation({ summary: "Get user's active credit" })
  async getActiveCredit(@Req() req: any) {
    const credit = await this.creditService.getUserActiveCredit(req.user.id);
    return { data: credit };
  }

  @Get()
  @ApiOperation({ summary: "Get user's credit history" })
  async getCredits(@Req() req: any) {
    return { data: await this.creditService.getUserCredits(req.user.id) };
  }

  @Get("notifications")
  @ApiOperation({ summary: "Get user's credit notifications" })
  async getNotifications(@Req() req: any) {
    return { data: await this.creditService.getUserNotifications(req.user.id) };
  }

  @Patch("notifications/:id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markNotificationRead(@Param("id") id: string, @Req() req: any) {
    return { data: await this.creditService.markNotificationRead(id, req.user.id) };
  }
}
