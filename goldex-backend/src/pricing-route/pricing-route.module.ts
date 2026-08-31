import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PriceRouteService } from "./price-route.service";

/**
 * @Global so pricing callers (the market list, the socket cache, market status)
 * share one resolver and therefore one cached pair graph. A second instance
 * would mean a second graph, and two callers could quote different prices for
 * the same pair in the same second.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PricePairEntity, SymbolEntity])],
  providers: [PriceRouteService],
  exports: [PriceRouteService],
})
export class PricingRouteModule {}
