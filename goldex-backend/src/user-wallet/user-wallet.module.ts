import { Module } from "@nestjs/common";
import { UserWalletService } from "./user-wallet.service";
import { UserWalletController } from "./user-wallet.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity, SymbolEntity])],
  providers: [UserWalletService],
  controllers: [UserWalletController],
  exports: [UserWalletService],
})
export class UserWalletModule {}
