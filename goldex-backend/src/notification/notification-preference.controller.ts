import { Controller, Get, Put, Body, UseGuards, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationPreferenceEntity } from "./entity/notification-preference.entity";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";
import { NotificationCategoryEnum } from "./enum/notification-category.enum";

class UpdatePreferencesDto {
  preferences: { channel: NotificationChannelEnum; category: NotificationCategoryEnum; enabled: boolean }[];
}

@Controller("notifications/preferences")
@ApiTags("Notification Preferences")
export class NotificationPreferenceController {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferenceRepository: Repository<NotificationPreferenceEntity>,
  ) {}

  @Get()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get notification preferences" })
  async getPreferences(@Req() req: UserExpressRequest) {
    const prefs = await this.preferenceRepository.find({
      where: { userId: req.user.id },
    });
    return { data: prefs };
  }

  @Put()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update notification preferences" })
  async updatePreferences(@Req() req: UserExpressRequest, @Body() dto: UpdatePreferencesDto) {
    const userId = req.user.id;
    for (const p of dto.preferences) {
      const existing = await this.preferenceRepository.findOne({
        where: { userId, channel: p.channel, category: p.category },
      });
      if (existing) {
        existing.enabled = p.enabled;
        await this.preferenceRepository.save(existing);
      } else {
        await this.preferenceRepository.save(
          this.preferenceRepository.create({
            userId,
            channel: p.channel,
            category: p.category,
            enabled: p.enabled,
          }),
        );
      }
    }
    const prefs = await this.preferenceRepository.find({ where: { userId } });
    return { data: prefs };
  }
}