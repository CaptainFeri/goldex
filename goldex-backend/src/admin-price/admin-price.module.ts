import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { PricePairHistoryEntity } from "../admin-pair/entity/price-pair-history.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PairPoolStatusEntity } from "../market-status/entity/pair-pool-status.entity";
import { MarketStatusModule } from "../market-status/market-status.module";
import { ProviderEntity } from "../provider/entity/provider.entity";
import { ProviderModule } from "../provider/provider.module";
import { WebSocketModule } from "../websocket/websocket.module";
import { AdminPriceController } from "./admin-price.controller";
import { AdminPriceService } from "./admin-price.service";
import { PriceEngineConfigEntity } from "./entity/price-engine-config.entity";

/**
 * Its own module, importing the three that already own the pieces: prices come
 * from `MarketService`'s live cache, open/closed from `MarketStatusService`,
 * and the sources are `ProviderService`'s rows. Nothing here re-reads a price
 * or re-derives a status — a second price path would eventually disagree with
 * the first, which is the whole reason the ticker was built this way too.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SymbolEntity,
      PricePairEntity,
      PricePairHistoryEntity,
      PairPoolStatusEntity,
      ProviderEntity,
      PriceEngineConfigEntity,
    ]),
    WebSocketModule,
    MarketStatusModule,
    ProviderModule,
  ],
  controllers: [AdminPriceController],
  providers: [AdminPriceService],
  exports: [AdminPriceService],
})
export class AdminPriceModule {}
