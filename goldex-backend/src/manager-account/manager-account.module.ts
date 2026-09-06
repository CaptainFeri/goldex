import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ManagerAccountService } from "./manager-account.service";
import { ManagerAccountController } from "./manager-account.controller";
import { ManagerAccountEntity } from "./entity/manager-account.entity";
import { ManagerAccountFundingEntity } from "./entity/manager-account-funding.entity";
import { ManagerAccountLedgerEntity } from "./entity/manager-account-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminEntity } from "../admin/entity/admin.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagerAccountEntity,
      ManagerAccountFundingEntity,
      ManagerAccountLedgerEntity,
      SymbolEntity,
      AdminEntity,
    ]),
  ],
  providers: [ManagerAccountService],
  controllers: [ManagerAccountController],
  // The arbitrage bots freeze and settle capital through this service.
  exports: [ManagerAccountService],
})
export class ManagerAccountModule {}
