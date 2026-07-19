import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderFinanceService } from "./provider-finance.service";
import { ProviderFinanceController } from "./provider-finance.controller";
import { ProviderSettlementEntity } from "./entity/provider-settlement.entity";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";

@Module({
  imports: [
    AdminScheduleModule,
    TypeOrmModule.forFeature([
      ProviderSettlementEntity,
      ProviderDealSnapshotEntity,
      SystemLedgerEntity,
      SymbolEntity,
    ]),
  ],
  providers: [ProviderFinanceService],
  controllers: [ProviderFinanceController],
})
export class ProviderFinanceModule {}
