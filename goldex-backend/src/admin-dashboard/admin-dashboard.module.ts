import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { OrderEntity } from "../order/order.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { ProviderEntity } from "../provider/entity/provider.entity";
import { ProviderPairMappingEntity } from "../provider-pair-mapping/entity/provider-pair-mapping.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { CreditEntity } from "../credit/entity/credit.entity";
import { PacketEntity } from "../warehouse/entity/packet.entity";
import { WarehouseEntity } from "../warehouse/entity/warehouse.entity";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";

/** Read-only over tables other modules own; it owns none of them. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserKycEntity,
      OrderEntity,
      WithdrawEntity,
      SystemLedgerEntity,
      ProviderEntity,
      ProviderPairMappingEntity,
      ProviderDealSnapshotEntity,
      PricePairEntity,
      SymbolEntity,
      CreditEntity,
      PacketEntity,
      WarehouseEntity,
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
