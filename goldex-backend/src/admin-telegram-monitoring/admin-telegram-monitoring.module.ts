import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { AdminTelegramMonitoringService } from './admin-telegram-monitoring.service';
import { AdminTelegramMonitoringController } from './admin-telegram-monitoring.controller';
import { TelegramMonitoringConsumer } from '../rabbitmq/consumers/telegram-monitoring.consumer';

@Module({
  imports: [RedisModule],
  providers: [AdminTelegramMonitoringService, TelegramMonitoringConsumer],
  controllers: [AdminTelegramMonitoringController],
})
export class AdminTelegramMonitoringModule {}
