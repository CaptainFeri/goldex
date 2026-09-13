import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderFinanceService } from "./provider-finance.service";
import { ProviderFinanceController } from "./provider-finance.controller";
import { ProviderSettlementEntity } from "./entity/provider-settlement.entity";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";
import { AdminAccountingModule } from "../admin-accounting/admin-accounting.module";
import { WarehouseModule } from "../warehouse/warehouse.module";

@Module({
  imports: [
    AdminScheduleModule,
    // For the settlement voucher, and for the unpacked-material balance a
    // settlement adds to.
    AdminAccountingModule,
    WarehouseModule,
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
