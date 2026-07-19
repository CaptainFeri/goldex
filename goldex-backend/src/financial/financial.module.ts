import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FinancialService } from "./financial.service";
import { ProviderBalanceConsumer } from "./provider-balance.consumer";
import { ProviderDealConsumer } from "./provider-deal.consumer";
import { AdminFinancialController } from "./admin-financial.controller";
import { SystemLedgerEntity } from "./entity/system-ledger.entity";
import { ProviderBalanceSnapshotEntity } from "./entity/provider-balance-snapshot.entity";
import { ProviderDealSnapshotEntity } from "./entity/provider-deal-snapshot.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { OrderEntity } from "../order/order.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";

@Module({
  imports: [
    AdminScheduleModule,
    TypeOrmModule.forFeature([
      SystemLedgerEntity,
      ProviderBalanceSnapshotEntity,
      ProviderDealSnapshotEntity,
      WalletEntity,
      TransactionEntity,
      OrderEntity,
      UserEntity,
      UserKycEntity,
      SymbolEntity,
    ]),
  ],
  providers: [FinancialService, ProviderBalanceConsumer, ProviderDealConsumer],
  controllers: [AdminFinancialController],
  exports: [FinancialService],
})
export class FinancialModule {}
