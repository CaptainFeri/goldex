import { Module } from '@nestjs/common';
import { AdminArbitrageService } from './admin-arbitrage.service';
import { AdminArbitrageController } from './admin-arbitrage.controller';
import { AdminArbitrageConsumer } from './admin-arbitrage.consumer';
import { RedisModule } from '../redis/redis.module';
import { AdminMonitoringModule } from '../admin-monitoring/admin-monitoring.module';

@Module({
  // AdminMonitoringModule exports PricingRedisService — the read-only client to
  // the pricing-engine's own Redis, used as the fallback source for scans.
  imports: [RedisModule, AdminMonitoringModule],
  providers: [AdminArbitrageService, AdminArbitrageConsumer],
  controllers: [AdminArbitrageController],
  exports: [AdminArbitrageService],
})
export class AdminArbitrageModule {}
