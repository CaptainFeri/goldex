import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AccountingVoucherEntity } from "./entity/accounting-voucher.entity";
import { AdminAccountingController } from "./admin-accounting.controller";
import { AdminAccountingService } from "./admin-accounting.service";
import { AccountingExportService } from "./accounting-export.service";

@Module({
  imports: [TypeOrmModule.forFeature([SystemLedgerEntity, AccountingVoucherEntity, SymbolEntity])],
  controllers: [AdminAccountingController],
  providers: [AdminAccountingService, AccountingExportService],
  exports: [AdminAccountingService],
})
export class AdminAccountingModule {}
