import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingController } from "./accounting.controller";
import { AccountingService } from "./accounting.service";
import { AccountingSettingService } from "./accounting-setting.service";
import { ValuationService } from "./valuation.service";
import { AccountingSettingEntity } from "./entity/accounting-setting.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountingSettingEntity,
      SystemLedgerEntity,
      WalletEntity,
      SymbolEntity,
      PricePairEntity,
    ]),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, AccountingSettingService, ValuationService],
  // ValuationService prices any asset in any other at live rates; the arbitrage
  // bots use it to mark a position's P&L against its frozen allocation.
  exports: [AccountingService, AccountingSettingService, ValuationService],
})
export class AccountingModule {}
