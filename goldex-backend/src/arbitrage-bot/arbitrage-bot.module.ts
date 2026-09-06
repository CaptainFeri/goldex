import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ArbitrageBotService } from "./arbitrage-bot.service";
import { ArbitrageBotEngineService } from "./arbitrage-bot-engine.service";
import { ArbitrageBotNotifierService } from "./arbitrage-bot-notifier.service";
import { ArbitrageBotOrderConsumer } from "./arbitrage-bot-order.consumer";
import { ArbitrageBotController } from "./arbitrage-bot.controller";
import { ArbitrageBotEntity } from "./entity/arbitrage-bot.entity";
import { ArbitrageBotTradeEntity } from "./entity/arbitrage-bot-trade.entity";
import { ArbitrageBotEventEntity } from "./entity/arbitrage-bot-event.entity";
import { ProviderPairMappingEntity } from "../provider-pair-mapping/entity/provider-pair-mapping.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminEntity } from "../admin/entity/admin.entity";
import { ManagerAccountModule } from "../manager-account/manager-account.module";
import { AccountingModule } from "../accounting/accounting.module";
import { NotificationModule } from "../notification/notification.module";
import { TelegramNotifierModule } from "../telegram-notifier/telegram-notifier.module";
import { SmsModule } from "../sms/sms.module";
import { RabbitMQModule } from "../rabbitmq/rabbitmq.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ArbitrageBotEntity,
      ArbitrageBotTradeEntity,
      ArbitrageBotEventEntity,
      ProviderPairMappingEntity,
      PricePairEntity,
      SymbolEntity,
      AdminEntity,
    ]),
    // Capital comes from manager accounts; sizing and P&L are valued at live
    // prices through the accounting module's valuation service.
    ManagerAccountModule,
    AccountingModule,
    NotificationModule,
    TelegramNotifierModule,
    SmsModule,
    RabbitMQModule,
  ],
  providers: [
    ArbitrageBotService,
    ArbitrageBotEngineService,
    ArbitrageBotNotifierService,
    ArbitrageBotOrderConsumer,
  ],
  controllers: [ArbitrageBotController],
  exports: [ArbitrageBotService],
})
export class ArbitrageBotModule {}
