import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WebSocketModule } from "../websocket/websocket.module";
import { AdminMarketController } from "./admin-market.controller";
import { AdminMarketService } from "./admin-market.service";

/**
 * Its own module rather than a controller on `AdminPairModule`, which
 * `WebSocketModule` already imports — putting the ticker there and importing
 * the websocket module back would close a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SymbolEntity]), WebSocketModule],
  controllers: [AdminMarketController],
  providers: [AdminMarketService],
  exports: [AdminMarketService],
})
export class AdminMarketModule {}
