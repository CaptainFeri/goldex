import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { MatchService } from "./match.service";
import { TelegramWebhookController } from "../telegram-notifier/telegram-webhook.controller";
import { OrderEntity } from "./order.entity";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { WalletCoreModule } from "../wallet/wallet-core.module";
import { ProviderPairMappingModule } from "../provider-pair-mapping/provider-pair-mapping.module";
import { TelegramNotifierModule } from "../telegram-notifier/telegram-notifier.module";
import { UserTelegramModule } from "../user-telegram/user-telegram.module";
import { QuoteRequestModule } from "../quote-request/quote-request.module";
import { OrderBookService } from "../order-book/order-book.service";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { CreditEntity } from "../credit/entity/credit.entity";
import { CreditOrderEntity } from "../credit/entity/credit-order.entity";
import { UserLevelModule } from "../user-level/user-level.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      UserEntity,
      PricePairEntity,
      WalletEntity,
      UserMarketTypeEntity,
      TransactionEntity,
      CreditEntity,
      CreditOrderEntity,
    ]),
    WalletCoreModule,
    ProviderPairMappingModule,
    TelegramNotifierModule,
    UserTelegramModule,
    QuoteRequestModule,
    UserLevelModule,
  ],
  controllers: [OrderController, TelegramWebhookController],
  providers: [OrderService, MatchService, OrderBookService],
  exports: [OrderService, MatchService],
})
export class OrderModule {}
