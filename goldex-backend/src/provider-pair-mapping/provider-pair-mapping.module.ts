import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProviderPairMappingEntity } from "./entity/provider-pair-mapping.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { PricePairHistoryEntity } from "../admin-pair/entity/price-pair-history.entity";
import { OrderEntity } from "../order/order.entity";
import { CreditEntity } from "../credit/entity/credit.entity";
import { CreditOrderEntity } from "../credit/entity/credit-order.entity";
import { ProviderPairMappingService } from "./provider-pair-mapping.service";
import { ProviderPairMappingController } from "./provider-pair-mapping.controller";
import { PairPriceConsumer } from "../rabbitmq/consumers/pair-price.consumer";
import { SnapshotConsumer } from "../rabbitmq/consumers/snapshot.consumer";
import { OrderStatusConsumer } from "../rabbitmq/consumers/order-status.consumer";
import { RedisModule } from "../redis/redis.module";
import { WalletCoreModule } from "../wallet/wallet-core.module";
import { OrderBookModule } from "../order-book/order-book.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProviderPairMappingEntity, PricePairEntity, PricePairHistoryEntity, OrderEntity, CreditEntity, CreditOrderEntity]),
    RedisModule,
    WalletCoreModule,
    OrderBookModule,
  ],
  providers: [ProviderPairMappingService, PairPriceConsumer, SnapshotConsumer, OrderStatusConsumer],
  controllers: [ProviderPairMappingController],
  exports: [ProviderPairMappingService],
})
export class ProviderPairMappingModule {}
