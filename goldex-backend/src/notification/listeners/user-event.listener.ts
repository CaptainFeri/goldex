import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";

@Injectable()
export class UserEventListener {
  private readonly logger = new Logger(UserEventListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent("user.registered")
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

  @OnEvent("user.password_changed")
  async handlePasswordChanged(payload: { userId: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.WARNING,
      category: NotificationCategoryEnum.SECURITY,
      title: "تغییر رمز عبور",
      body: "رمز عبور شما با موفقیت تغییر یافت",
    });
  }

  @OnEvent("user.blocked")
  async handleUserBlocked(payload: { userId: string; reason?: string }) {
    await this.notificationService.create({
      userId: payload.userId,
      type: NotificationTypeEnum.ERROR,
      category: NotificationCategoryEnum.SECURITY,
      title: "مسدود شدن حساب",
      body: payload.reason ? `حساب شما مسدود شد. دلیل: ${payload.reason}` : "حساب شما مسدود شد",
    });
  }

  @OnEvent("user.unblocked")
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
