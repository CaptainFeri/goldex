import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { WarehouseController } from "./warehouse.controller";
import { WarehouseService } from "./service/warehouse.service";
import { PacketService } from "./service/packet.service";
import { WarehouseRequestService } from "./service/warehouse-request.service";
import { WarehouseCronService } from "./warehouse-cron.service";
import { WarehouseEntity } from "./entity/warehouse.entity";
import { PacketEntity } from "./entity/packet.entity";
import { WarehouseRequestEntity } from "./entity/warehouse-request.entity";
import { WarehouseHistoryEntity } from "./entity/warehouse-history.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { ProviderSettlementEntity } from "../provider-finance/entity/provider-settlement.entity";
import { MinioModule } from "../minio/minio.module";
import { SmsModule } from "../sms/sms.module";
import { AdminWarehouseModule } from "./admin/admin-warehouse.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseEntity,
      PacketEntity,
      WarehouseRequestEntity,
      WarehouseHistoryEntity,
      WalletEntity,
      TransactionEntity,
      ProviderSettlementEntity,
    ]),
    MinioModule,
    SmsModule,
    ScheduleModule,
    AdminWarehouseModule,
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService, PacketService, WarehouseRequestService, WarehouseCronService],
  exports: [WarehouseService, PacketService, WarehouseRequestService],
})
export class WarehouseModule {}
