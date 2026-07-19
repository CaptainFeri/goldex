import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserLevelService } from "./user-level.service";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";

@ApiTags("User-UserLevel")
@Controller("user-level")
export class UserLevelUserController {
  constructor(private readonly levelService: UserLevelService) {}

  @Get("me")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async getMyLevel(@Req() req: any) {
    const level = await this.levelService.getUserLevel(req.user.id);
    return { data: level };
  }

  @Get("me/features")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async getMyFeatures(@Req() req: any) {
    const level = await this.levelService.getUserLevel(req.user.id);
    return { data: level?.features ?? {} };
  }
}
