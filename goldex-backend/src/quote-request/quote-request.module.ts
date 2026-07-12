import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { QuoteRequestEntity } from "./quote-request.entity";
import { QuoteRequestService } from "./quote-request.service";
import { QuoteRequestController } from "./quote-request.controller";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { UserTelegramModule } from "../user-telegram/user-telegram.module";
import { TelegramNotifierModule } from "../telegram-notifier/telegram-notifier.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([QuoteRequestEntity, WalletEntity, PricePairEntity]),
    UserTelegramModule,
    TelegramNotifierModule,
  ],
  providers: [QuoteRequestService],
  controllers: [QuoteRequestController],
  exports: [QuoteRequestService],
})
export class QuoteRequestModule {}
