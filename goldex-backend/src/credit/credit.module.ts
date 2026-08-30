import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CreditService } from "./credit.service";
import { CreditCronService } from "./credit-cron.service";
import { CreditSettlementService } from "./settlement/credit-settlement.service";
import { CreditSettlementWorkflowService } from "./settlement-workflow/credit-settlement-workflow.service";
import { CreditCashoutService } from "./cashout/credit-cashout.service";
import { CreditAdminController } from "./admin/credit-admin.controller";
import { CreditUserController } from "./user/credit-user.controller";
import { CreditEntity } from "./entity/credit.entity";
import { CreditOrderEntity } from "./entity/credit-order.entity";
import { CreditNotificationEntity } from "./entity/credit-notification.entity";
import { CollateralLockEntity } from "./entity/collateral-lock.entity";
import { CreditSettlementEntity } from "./entity/credit-settlement.entity";
import { CreditCashoutEntity } from "./entity/credit-cashout.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { FinanceLogEntity } from "../finance-log/entity/finance-log.entity";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";
import { UserLevelModule } from "../user-level/user-level.module";
import { WalletCoreModule } from "../wallet/wallet-core.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditEntity,
      CreditOrderEntity,
      CreditNotificationEntity,
      CollateralLockEntity,
      CreditSettlementEntity,
      CreditCashoutEntity,
      WalletEntity,
      TransactionEntity,
      SymbolEntity,
      PricePairEntity,
      UserEntity,
      UserKycEntity,
      FinanceLogEntity,
    ]),
    AdminScheduleModule,
    UserLevelModule,
    WalletCoreModule,
  ],
  controllers: [CreditAdminController, CreditUserController],
  providers: [CreditService, CreditCronService, CreditSettlementService, CreditSettlementWorkflowService, CreditCashoutService],
  exports: [CreditService, CreditSettlementService, CreditSettlementWorkflowService, CreditCashoutService],
})
export class CreditModule {}
