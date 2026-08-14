import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { KycEvents } from "../../shared/constants/events.constants";

@Injectable()
export class KycEventListener {
  private readonly logger = new Logger(KycEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(KycEvents.APPROVED)
  async handleKycApproved(payload: { userId: string; level: number }) {
    this.logger.log(`KYC approved: user=${payload.userId} level=${payload.level}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.KYC,
      title: "تأیید احراز هویت",
      body: `احراز هویت سطح ${payload.level} شما با موفقیت تأیید شد`,
      metadata: { kycLevel: payload.level },
    });
  }

  @OnEvent(KycEvents.REJECTED)
  async handleKycRejected(payload: { userId: string; reason: string }) {
    this.logger.log(`KYC rejected: user=${payload.userId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.KYC,
      title: "رد احراز هویت",
      body: `احراز هویت شما رد شد. دلیل: ${payload.reason}`,
      metadata: { rejectReason: payload.reason },
    });
  }

  @OnEvent(KycEvents.DOCUMENT_REQUIRED)
  async handleKycDocumentRequired(payload: { userId: string; documentType: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.KYC,
      title: "مدارک مورد نیاز",
      body: `لطفاً مدرک ${payload.documentType} را بارگذاری کنید`,
      metadata: { documentType: payload.documentType },
    });
  }
}
