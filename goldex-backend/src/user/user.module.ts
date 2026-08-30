import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { UserEntity } from "./entity/user.entity";
import appEnvConfig from "../config/app.env.config";
import { RedisModule } from "../redis/redis.module";
import { UserService } from "./service/user.service";
import { BaseinfoModule } from "../baseinfo/baseinfo.module";
import { UserDeviceEntity } from "./entity/user.device.entity";
import { UserProfileEntity } from "./entity/user.profile.entity";
import { UserSettingEntity } from "./entity/user.setting.entity";
import { AuthUserController } from "./controller/user.auth.controller";
import { User2FASettingEntity } from "./entity/user.2fa.setting.entity";
import { UserLoginHistoryEntity } from "./entity/user.login.history.entity";
import { UserRefreshTokenEntity } from "./entity/user.refresh.token.entity";
import { UserAuthMiddleware } from "./auth/middleware/user-auth.middleware";
import { UserProfileController } from "./controller/profile.user.controller";
import { SmsModule } from "../sms/sms.module";
import { UserKycEntity } from "./entity/user.kyc.entity";
import { JibitProvider } from "../kyc/providers/jibit/jibit.provider";
import { UserKycService } from "./service/user-kyc.service";
import { UserKycHistoryEntity } from "./entity/user.kyc.history.entity";
import { HttpModule } from "@nestjs/axios";
import { UserKycController } from "./controller/user.kyc.controller";
import { UserBankAccountEntity } from "./entity/user.bank.account.entity";
import { MinioModule } from "../minio/minio.module";
import { UserKycDocumentEntity } from "./entity/user.kyc.document.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { UserWalletService } from "../user-wallet/user-wallet.service";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserMarketTypeEntity } from "./entity/user.market.type.entity";
import { UserLevelModule } from "../user-level/user-level.module";

@Module({
  imports: [
    RedisModule,
    BaseinfoModule,
    MailModule,
    SmsModule,
    HttpModule,
    MinioModule,
    UserLevelModule,
    TypeOrmModule.forFeature([
      UserEntity,
      UserProfileEntity,
      UserSettingEntity,
      UserLoginHistoryEntity,
      UserDeviceEntity,
      UserRefreshTokenEntity,
      User2FASettingEntity,
      UserKycEntity,
      UserKycHistoryEntity,
      UserBankAccountEntity,
      UserKycDocumentEntity,
      WalletEntity,
      TransactionEntity,
      SymbolEntity,
      UserMarketTypeEntity,
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<ConfigType<typeof appEnvConfig>>) => ({
        secret: configService.get("user", { infer: true }).userJwtSecret,
        signOptions: {
          expiresIn: Number(configService.get("user", { infer: true }).userJwtExpirationTime),
        },
      }),
    }),
  ],
  providers: [UserService, JibitProvider, UserKycService, UserWalletService],
  controllers: [AuthUserController, UserProfileController, UserKycController],
  exports: [UserKycService],
})
export class UserModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserAuthMiddleware).forRoutes({
      path: "*",
      method: RequestMethod.ALL,
    });
  }
}
