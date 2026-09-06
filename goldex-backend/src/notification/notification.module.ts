import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationEntity } from "./entity/notification.entity";
import { NotificationTemplateEntity } from "./entity/notification-template.entity";
import { NotificationPreferenceEntity } from "./entity/notification-preference.entity";
import { NotificationService } from "./notification.service";
import { NotificationDispatcher } from "./notification-dispatcher.service";
import { NotificationController } from "./notification.controller";
import { NotificationPreferenceController } from "./notification-preference.controller";
import { AdminNotificationController } from "./admin-notification.controller";
import { NotificationTemplateController } from "./notification-template.controller";
import { InAppChannelService } from "./channels/in-app.channel.service";
import { EmailChannelService } from "./channels/email.channel.service";
import { SmsChannelService } from "./channels/sms.channel.service";
import { TelegramChannelService } from "./channels/telegram.channel.service";
import { NotificationTemplateService } from "./notification-template.service";
import { NotificationBroadcastService } from "./notification-broadcast.service";
import { CreditEventListener } from "./listeners/credit-event.listener";
import { KycEventListener } from "./listeners/kyc-event.listener";
import { OrderEventListener } from "./listeners/order-event.listener";
import { UserEventListener } from "./listeners/user-event.listener";
import { TicketEventListener } from "./listeners/ticket-event.listener";
import { DepositEventListener } from "./listeners/deposit-event.listener";
import { WithdrawEventListener } from "./listeners/withdraw-event.listener";
import { AdminNotificationGateway } from "./admin-notification.gateway";
import { NotificationGateway } from "./notification.gateway";
import { P2pEventListener } from "./listeners/p2p-event.listener";
import { SmsModule } from "../sms/sms.module";
import { MailModule } from "../mail/mail.module";
import { TelegramNotifierModule } from "../telegram-notifier/telegram-notifier.module";
import { UserTelegramEntity } from "../user-telegram/user-telegram.entity";
import { RedisModule } from "../redis/redis.module";
import { CrmModule } from "../crm/crm.module";
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
    CrmModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationController, NotificationPreferenceController, AdminNotificationController, NotificationTemplateController],
  providers: [
    NotificationService,
    NotificationDispatcher,
    NotificationTemplateService,
    NotificationBroadcastService,
    InAppChannelService,
    EmailChannelService,
    SmsChannelService,
    TelegramChannelService,
    CreditEventListener,
    KycEventListener,
    OrderEventListener,
    UserEventListener,
    TicketEventListener,
    DepositEventListener,
    WithdrawEventListener,
    NotificationGateway,
    AdminNotificationGateway,
    P2pEventListener,
  ],
  // AdminNotificationGateway is exported so other modules can push to the
  // operator feed — the arbitrage bots alert their owners through it.
  exports: [NotificationService, AdminNotificationGateway],
})
export class NotificationModule {}
