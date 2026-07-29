import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationEntity } from "./entity/notification.entity";
import { NotificationTemplateEntity } from "./entity/notification-template.entity";
import { NotificationPreferenceEntity } from "./entity/notification-preference.entity";
import { NotificationService } from "./notification.service";
import { NotificationDispatcher } from "./notification-dispatcher.service";
import { NotificationController } from "./notification.controller";
import { AdminNotificationController } from "./admin-notification.controller";
import { InAppChannelService } from "./channels/in-app.channel.service";
import { EmailChannelService } from "./channels/email.channel.service";
import { SmsChannelService } from "./channels/sms.channel.service";
import { TelegramChannelService } from "./channels/telegram.channel.service";
import { CreditEventListener } from "./listeners/credit-event.listener";
import { KycEventListener } from "./listeners/kyc-event.listener";
import { OrderEventListener } from "./listeners/order-event.listener";
import { UserEventListener } from "./listeners/user-event.listener";
import { NotificationGateway } from "./notification.gateway";
import { SmsModule } from "../sms/sms.module";
import { MailModule } from "../mail/mail.module";
import { TelegramNotifierModule } from "../telegram-notifier/telegram-notifier.module";
import { UserTelegramEntity } from "../user-telegram/user-telegram.entity";
import { RedisModule } from "../redis/redis.module";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationTemplateEntity,
      NotificationPreferenceEntity,
      UserTelegramEntity,
    ]),
    SmsModule,
    MailModule,
    TelegramNotifierModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationController, AdminNotificationController],
  providers: [
    NotificationService,
    NotificationDispatcher,
    InAppChannelService,
    EmailChannelService,
    SmsChannelService,
    TelegramChannelService,
    CreditEventListener,
    KycEventListener,
    OrderEventListener,
    UserEventListener,
    NotificationGateway,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
