import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserLevelEntity } from "./entity/user-level.entity";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserLevelService } from "./user-level.service";
import { UserLevelController } from "./user-level.controller";
import { UserLevelUserController } from "./user-level-user.controller";
import { UserLevelGuard } from "./user-level.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserLevelEntity,
      UserEntity,
      PricePairEntity,
      WalletEntity,
      SymbolEntity,
    ]),
  ],
  providers: [UserLevelService, UserLevelGuard],
  controllers: [UserLevelController, UserLevelUserController],
  exports: [UserLevelService, UserLevelGuard],
})
export class UserLevelModule {}
