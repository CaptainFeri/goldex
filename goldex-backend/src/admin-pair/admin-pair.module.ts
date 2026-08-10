import { Module } from "@nestjs/common";
import { AdminPairService } from "./admin-pair.service";
import { AdminPairController } from "./admin-pair.controller";
import { MarketController } from "./market.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PricePairEntity } from "./entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserMarketKindEntity } from "../user/entity/user.market.kind.entity";

@Module({
  imports: [TypeOrmModule.forFeature([PricePairEntity, SymbolEntity, UserMarketTypeEntity, UserMarketKindEntity])],
  providers: [AdminPairService],
  controllers: [AdminPairController, MarketController],
  exports: [AdminPairService],
})
export class AdminPairModule {}
