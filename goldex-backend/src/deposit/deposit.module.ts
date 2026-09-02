import { Module } from "@nestjs/common";
import { P2pModule } from "../p2p/p2p.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DepositEntity } from "./deposit.entity";
import { DepositService } from "./deposit.service";
import { DepositController } from "./deposit.controller";
import { DepositAdminController } from "./deposit-admin.controller";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { MinioModule } from "../minio/minio.module";
import { OcrModule } from "../ocr/ocr.module";
import { PaymentBusModule } from "../payment-bus/payment-bus.module";
import { UserLevelModule } from "../user-level/user-level.module";

@Module({
  imports: [
    P2pModule,
    TypeOrmModule.forFeature([DepositEntity, SymbolEntity, WalletEntity, TransactionEntity]), MinioModule, OcrModule, PaymentBusModule, UserLevelModule],
  providers: [DepositService],
  controllers: [DepositController, DepositAdminController],
  exports: [DepositService],
})
export class DepositModule {}
