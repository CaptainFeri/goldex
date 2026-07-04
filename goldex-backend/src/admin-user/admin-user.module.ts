import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminUserService } from "./admin-user.service";
import { UserEntity } from "../user/entity/user.entity";
import { BaseinfoModule } from "../baseinfo/baseinfo.module";
import { AdminUserController } from "./admin-user.controller";
import { UserProfileEntity } from "../user/entity/user.profile.entity";
import { UserLoginHistoryEntity } from "../user/entity/user.login.history.entity";
import { UserSettingEntity } from "../user/entity/user.setting.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [
    BaseinfoModule,
    RedisModule,
    TypeOrmModule.forFeature([
      UserEntity,
      UserProfileEntity,
      UserLoginHistoryEntity,
      UserSettingEntity,
      UserKycEntity,
      WalletEntity,
      SymbolEntity,
      UserMarketTypeEntity,
    ]),
  ],
  providers: [AdminUserService],
  controllers: [AdminUserController],
})
export class AdminUserModule {}
