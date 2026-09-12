// admin-wallet.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminWalletController } from "./admin-wallet.controller";
import { AdminWalletService } from "./admin-wallet.service";
import { AdminWalletLogEntity } from "./entity/admin-wallet-log.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { UserEntity } from "../user/entity/user.entity";
import { FinanceLogEntity } from "../finance-log/entity/finance-log.entity";
import { AccountingVoucherEntity } from "../admin-accounting/entity/accounting-voucher.entity";
import { AccountingVoucherWriter } from "../admin-accounting/accounting-voucher.writer";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WalletEntity,
      TransactionEntity,
      AdminWalletLogEntity,
      // Read to name the customer on the voucher, and written to record the
      // entry and the operation alongside the balance change.
      UserEntity,
      FinanceLogEntity,
      AccountingVoucherEntity,
    ]),
  ],
  controllers: [AdminWalletController],
  providers: [AdminWalletService, AccountingVoucherWriter],
  exports: [AdminWalletService],
})
export class AdminWalletModule {}
