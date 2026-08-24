import { Controller, Get, Patch, Post, Body, Param, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { RequestCreditDto } from "../dto/request-credit.dto";
import { UserAuthGuard } from "../../user/auth/Guard/user.guard";
import { UserLevelGuard } from "../../user-level/user-level.guard";

@ApiTags("User-Credit")
@Controller("credits")
@UseGuards(UserAuthGuard, UserLevelGuard)
@ApiBearerAuth()
export class CreditUserController {
  constructor(private readonly creditService: CreditService) {}

  @Post("request")
  @ApiOperation({ summary: "Open a self-service credit facility (freeze collateral + leverage)" })
  async requestCredit(@Req() req: any, @Body() dto: RequestCreditDto) {
    return { data: await this.creditService.requestCredit(req.user.id, dto) };
  }

  @Post(":id/settle")
  @ApiOperation({ summary: "User self-settle: repay credit and release assets to deposit wallet" })
  async settleCredit(@Req() req: any, @Param("id") id: string) {
    return { data: await this.creditService.settleFromUser(req.user.id, id) };
  }

  @Get("active")
  @ApiOperation({ summary: "Get user's active credit" })
  async getActiveCredit(@Req() req: any) {
    const credit = await this.creditService.getUserActiveCredit(req.user.id);
    return { data: credit };
  }

  @Get("overview")
  @ApiOperation({ summary: "Get user's active credit overview (used/available, collateral, states)" })
  async getOverview(@Req() req: any) {
    return { data: await this.creditService.getCreditOverview(req.user.id) };
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
