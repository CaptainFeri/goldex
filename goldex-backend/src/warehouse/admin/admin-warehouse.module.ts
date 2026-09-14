import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminWarehouseController } from "./admin-warehouse.controller";
import { WarehouseService } from "../service/warehouse.service";
import { PacketService } from "../service/packet.service";
import { WarehouseRequestService } from "../service/warehouse-request.service";
import { AllocationService } from "../service/allocation.service";
import { WarehouseVoucherService } from "../service/warehouse-voucher.service";
import { MovementService } from "../service/movement.service";
import { ManualMovementService } from "../service/manual-movement.service";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { WarehouseMovementEntity } from "../entity/warehouse-movement.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { ProviderSettlementEntity } from "../../provider-finance/entity/provider-settlement.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { ProviderEntity } from "../../provider/entity/provider.entity";
import { AdminAccountingModule } from "../../admin-accounting/admin-accounting.module";
import { MinioModule } from "../../minio/minio.module";
import { SmsModule } from "../../sms/sms.module";
import { AdminScheduleModule } from "../../admin-schedule/admin-schedule.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseEntity,
      PacketEntity,
      WarehouseRequestEntity,
      WarehouseHistoryEntity,
      WarehouseMovementEntity,
      WalletEntity,
      TransactionEntity,
      ProviderSettlementEntity,
      SymbolEntity,
      ProviderEntity,
    ]),
    AdminAccountingModule,
    MinioModule,
    SmsModule,
    AdminScheduleModule,
  ],
  controllers: [AdminWarehouseController],
  providers: [WarehouseService, PacketService, WarehouseRequestService, AllocationService, WarehouseVoucherService, MovementService, ManualMovementService],
  exports: [WarehouseService, PacketService, WarehouseRequestService, AllocationService, WarehouseVoucherService, MovementService, ManualMovementService],
})
export class AdminWarehouseModule {}
