import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { CustomerSegmentService } from "../crm/services/customer-segment.service";
import { NotificationService, CreateNotificationDto } from "./notification.service";
import { NotificationTemplateService } from "./notification-template.service";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";
import { NotificationTypeEnum } from "./enum/notification-type.enum";
import { NotificationCategoryEnum } from "./enum/notification-category.enum";

export interface BroadcastSegmentResult {
  segmentId: string;
  targetCount: number;
  createdCount: number;
  skippedCount: number;
}

@Injectable()
export class NotificationBroadcastService {
  private readonly logger = new Logger(NotificationBroadcastService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly segmentService: CustomerSegmentService,
    private readonly templateService: NotificationTemplateService,
  ) {}

  async sendToSegment(dto: {
    segmentId: string;
    mode?: "dynamic" | "manual";
    type?: NotificationTypeEnum;
    category?: NotificationCategoryEnum;
    title?: string;
    body?: string;
    templateSlug?: string;
    variables?: Record<string, any>;
    channels?: NotificationChannelEnum[];
  }): Promise<BroadcastSegmentResult> {
    const targetIds =
      dto.mode === "dynamic"
        ? await this.segmentService.evaluateSegment(dto.segmentId)
        : await this.segmentService.getSegmentMembers(dto.segmentId);

    if (targetIds.length === 0) {
      throw new BadRequestException("Segment has no members to notify");
    }

    let createdCount = 0;
    let skippedCount = 0;

    for (const userId of targetIds) {
      const created = await this.createForUser(userId, dto);
      if (created) {
        createdCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    this.logger.log(
      `Broadcast to segment ${dto.segmentId}: ${createdCount} created, ${skippedCount} skipped (of ${targetIds.length})`,
    );

    return {
      segmentId: dto.segmentId,
      targetCount: targetIds.length,
      createdCount,
      skippedCount,
    };
  }

  private async createForUser(
    userId: string,
    dto: {
      type?: NotificationTypeEnum;
      category?: NotificationCategoryEnum;
      title?: string;
      body?: string;
      templateSlug?: string;
      variables?: Record<string, any>;
      channels?: NotificationChannelEnum[];
    },
  ): Promise<boolean> {
    let title = dto.title;
    let body = dto.body;
    let templateSlug: string | undefined = dto.templateSlug;

    if (dto.templateSlug) {
      const rendered = await this.templateService.render(
        dto.templateSlug,
        NotificationChannelEnum.IN_APP,
        dto.variables,
      );
      if (!rendered) {
        // Template exists but IN_APP channel disabled -> skip entirely.
        return false;
      }
      title = title || rendered.title;
      body = body || rendered.body;
    }

    if (!title || !body) {
      throw new BadRequestException("Either title/body or a templateSlug is required");
    }

    const payload: CreateNotificationDto = {
      userId,
      type: dto.type || NotificationTypeEnum.SYSTEM,
      category: dto.category || NotificationCategoryEnum.PROMOTION,
      title,
      body,
      channels: dto.channels,
      metadata: {
        ...(dto.variables || {}),
        templateSlug,
        campaign: true,
      },
    };

    const created = await this.notificationService.create(payload);
    return created.length > 0;
  }
}
