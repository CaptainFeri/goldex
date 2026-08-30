import { Module } from "@nestjs/common";
import { UserWalletService } from "./user-wallet.service";
import { UserWalletController } from "./user-wallet.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserLevelModule } from "../user-level/user-level.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletEntity, TransactionEntity, SymbolEntity, UserMarketTypeEntity, UserEntity]),
    UserLevelModule,
  ],
  providers: [UserWalletService],
  controllers: [UserWalletController],
  exports: [UserWalletService],
})
export class UserWalletModule {}
