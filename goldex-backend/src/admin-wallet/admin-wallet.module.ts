// admin-wallet.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminWalletController } from "./admin-wallet.controller";
import { AdminWalletService } from "./admin-wallet.service";
import { AdminWalletLogEntity } from "./entity/admin-wallet-log.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, TransactionEntity, AdminWalletLogEntity])],
  controllers: [AdminWalletController],
  providers: [AdminWalletService],
  exports: [AdminWalletService],
})
export class AdminWalletModule {}
