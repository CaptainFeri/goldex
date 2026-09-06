import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../user/entity/user.entity";
import { OrderEntity } from "../order/order.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

/** Read-only over four existing tables; it owns none of them. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, OrderEntity, WithdrawEntity, SystemLedgerEntity])],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
