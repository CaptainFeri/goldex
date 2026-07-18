import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FinanceLogService } from "./finance-log.service";
import { FinanceLogController } from "./finance-log.controller";
import { FinanceLogEntity } from "./entity/finance-log.entity";
import { AdminEntity } from "../admin/entity/admin.entity";
import { UserEntity } from "../user/entity/user.entity";
import { CreditEntity } from "../credit/entity/credit.entity";
import { OrderEntity } from "../order/order.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinanceLogEntity,
      AdminEntity,
      UserEntity,
      CreditEntity,
      OrderEntity,
      WalletEntity,
    ]),
  ],
  controllers: [FinanceLogController],
  providers: [FinanceLogService],
  exports: [FinanceLogService],
})
export class FinanceLogModule {}
