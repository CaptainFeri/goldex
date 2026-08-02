import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WithdrawEntity } from "./withdraw.entity";
import { WithdrawService } from "./withdraw.service";
import { WithdrawController } from "./withdraw.controller";
import { WithdrawAdminController } from "./withdraw-admin.controller";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { MinioModule } from "../minio/minio.module";
import { OcrModule } from "../ocr/ocr.module";
import { PaymentBusModule } from "../payment-bus/payment-bus.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([WithdrawEntity, SymbolEntity, WalletEntity, TransactionEntity]),
    MinioModule,
    OcrModule,
    PaymentBusModule,
  ],
  providers: [WithdrawService],
  controllers: [WithdrawController, WithdrawAdminController],
  exports: [WithdrawService],
})
export class WithdrawModule {}
