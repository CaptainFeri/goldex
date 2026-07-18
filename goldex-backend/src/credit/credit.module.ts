import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CreditService } from "./credit.service";
import { CreditCronService } from "./credit-cron.service";
import { CreditAdminController } from "./admin/credit-admin.controller";
import { CreditUserController } from "./user/credit-user.controller";
import { CreditEntity } from "./entity/credit.entity";
import { CreditOrderEntity } from "./entity/credit-order.entity";
import { CreditNotificationEntity } from "./entity/credit-notification.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserEntity } from "../user/entity/user.entity";
import { FinanceLogEntity } from "../finance-log/entity/finance-log.entity";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditEntity,
      CreditOrderEntity,
      CreditNotificationEntity,
      WalletEntity,
      TransactionEntity,
      SymbolEntity,
      UserEntity,
      FinanceLogEntity,
    ]),
    AdminScheduleModule,
  ],
  controllers: [CreditAdminController, CreditUserController],
  providers: [CreditService, CreditCronService],
  exports: [CreditService],
})
export class CreditModule {}
