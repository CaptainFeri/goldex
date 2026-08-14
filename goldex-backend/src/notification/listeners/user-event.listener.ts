import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { UserEvents } from "../../shared/constants/events.constants";

@Injectable()
export class UserEventListener {
  private readonly logger = new Logger(UserEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(UserEvents.REGISTERED)
  async handleUserRegistered(payload: { userId: string; email?: string; phone?: string }) {
    this.logger.log(`User registered: ${payload.userId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.SYSTEM,
      title: "خوش آمدید",
      body: "به گلدکس خوش آمدید. ثبت نام شما با موفقیت انجام شد",
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
      userEmail: payload.email,
      userPhone: payload.phone,
    });
  }

  @OnEvent(UserEvents.PASSWORD_CHANGED)
  async handlePasswordChanged(payload: { userId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.SECURITY,
      title: "تغییر رمز عبور",
      body: "رمز عبور شما با موفقیت تغییر یافت",
    });
  }

  @OnEvent(UserEvents.REFERRAL)
  async handleUserReferral(payload: { userId: string; referrerId: string; referralCode: string }) {
    this.logger.log(`User joined via referral: user=${payload.userId} referrer=${payload.referrerId}`);
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.PROMOTION,
      title: "ثبت نام با کد معرف",
      body: "ثبت نام شما با موفقیت انجام شد. کد معرف اعمال گردید",
      metadata: { referralCode: payload.referralCode },
      channels: [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    });
  }

  @OnEvent(UserEvents.LEVEL_CHANGED)
  async handleLevelChanged(payload: { userId: string; levelId: string; levelName: string; previousLevelId?: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.SYSTEM,
      title: "تغییر سطح کاربری",
      body: `سطح کاربری شما به «${payload.levelName}» ارتقا یافت`,
      metadata: { levelId: payload.levelId, previousLevelId: payload.previousLevelId },
    });
  }

  @OnEvent(UserEvents.LEVEL_UNASSIGNED)
  async handleLevelUnassigned(payload: { userId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.INFO,
      category: NotificationCategoryEnum.SYSTEM,
      title: "لغو سطح کاربری",
      body: "سطح ویژه شما لغو شد",
    });
  }

  @OnEvent(UserEvents.BLOCKED)
  async handleUserBlocked(payload: { userId: string; reason?: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.SECURITY,
      title: "مسدود شدن حساب",
      body: payload.reason ? `حساب شما مسدود شد. دلیل: ${payload.reason}` : "حساب شما مسدود شد",
    });
  }

  @OnEvent(UserEvents.UNBLOCKED)
  async handleUserUnblocked(payload: { userId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.SUCCESS,
      category: NotificationCategoryEnum.SECURITY,
      title: "رفع مسدودی",
      body: "مسدودی حساب شما رفع شد",
    });
  }
}
