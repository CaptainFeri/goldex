import { Module } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageController } from './arbitrage.controller';
import { ConsoleFormatterService } from '../common/console-formatter.service';

// RedisService and RabbitMQService come from their @Global modules.
@Module({
  controllers: [ArbitrageController],
  providers: [ArbitrageService, ConsoleFormatterService],
  exports: [ArbitrageService],
})
export class ArbitrageModule {}
