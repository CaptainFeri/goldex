import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminMonitoringController } from "./admin-monitoring.controller";
import { AdminMonitoringService } from "./admin-monitoring.service";
import { PricingRedisService } from "./pricing-redis.service";
import { ProviderPairMappingModule } from "../provider-pair-mapping/provider-pair-mapping.module";

@Module({
  imports: [ConfigModule, ProviderPairMappingModule],
  controllers: [AdminMonitoringController],
  providers: [AdminMonitoringService, PricingRedisService],
  exports: [AdminMonitoringService, PricingRedisService],
})
export class AdminMonitoringModule {}
