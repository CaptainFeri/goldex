import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { OrderEntity } from "./order.entity";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { WalletCoreModule } from "../wallet/wallet-core.module";
import { ProviderPairMappingModule } from "../provider-pair-mapping/provider-pair-mapping.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, UserEntity, PricePairEntity]),
    WalletCoreModule,
    ProviderPairMappingModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
