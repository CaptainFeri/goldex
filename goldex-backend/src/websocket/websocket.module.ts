// websocket/websocket.module.ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { MarketGateway } from "./market.gateway";
import { MarketService } from "./market.service";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { AdminPairModule } from "../admin-pair/admin-pair.module";
import { AdminPairService } from "../admin-pair/admin-pair.service";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([PricePairEntity, SymbolEntity]),
    AdminPairModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET"),
        signOptions: { expiresIn: "24h" },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [MarketGateway, MarketService, AdminPairService],
  exports: [MarketService],
})
export class WebSocketModule {}
