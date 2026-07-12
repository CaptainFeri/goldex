import { Controller, Post, Delete, Body, HttpCode, HttpStatus, UseGuards, Get, Req } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { UserTelegramService } from "./user-telegram.service";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";

class LinkTelegramDto {
  telegramId: number;
}

@ApiTags("User-Telegram")
@Controller({ path: "user-telegram", version: "1" })
export class UserTelegramController {
  constructor(private readonly service: UserTelegramService) {}

  @Post("link")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async link(@Req() req: UserExpressRequest, @Body() dto: LinkTelegramDto) {
    const entity = await this.service.link(dto.telegramId, req.user.id);
    return { data: { telegramId: entity.telegramId } };
  }

  @Delete("unlink")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@Req() req: UserExpressRequest) {
    const entity = await this.service.findByUserId(req.user.id);
    if (entity) await this.service.unlink(entity.telegramId);
  }

  @Get("me")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async get(@Req() req: UserExpressRequest) {
    const entity = await this.service.findByUserId(req.user.id);
    return { data: entity ? { telegramId: entity.telegramId } : null };
  }
}
