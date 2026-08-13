import { Module } from '@nestjs/common';
import { AdminArbitrageService } from './admin-arbitrage.service';
import { AdminArbitrageController } from './admin-arbitrage.controller';
import { AdminArbitrageConsumer } from './admin-arbitrage.consumer';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [AdminArbitrageService, AdminArbitrageConsumer],
  controllers: [AdminArbitrageController],
  exports: [AdminArbitrageService],
})
export class AdminArbitrageModule {}
