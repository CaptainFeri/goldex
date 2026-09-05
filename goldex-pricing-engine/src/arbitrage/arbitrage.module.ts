import { Module } from '@nestjs/common';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageCommandConsumer } from './arbitrage-command.consumer';
import { ConsoleFormatterService } from '../common/console-formatter.service';

// RedisService and RabbitMQService come from their @Global modules.
@Module({
  controllers: [],
  providers: [ArbitrageService, ArbitrageCommandConsumer, ConsoleFormatterService],
  exports: [ArbitrageService],
})
export class ArbitrageModule {}
