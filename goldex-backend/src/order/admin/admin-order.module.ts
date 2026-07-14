// admin/admin-order.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminOrderService } from "./admin-order.service";
import { OrderEntity } from "../order.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { AdminWalletLogEntity } from "../../admin-wallet/entity/admin-wallet-log.entity";
import { AdminOrderController } from "./admin-ordeer.controller";
import { OrderBookService } from "../../order-book/order-book.service";
import { QuoteRequestEntity } from "../../quote-request/quote-request.entity";
import { WalletCoreModule } from "../../wallet/wallet-core.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      WalletEntity,
      TransactionEntity,
      AdminWalletLogEntity,
      PricePairEntity,
      SymbolEntity,
      QuoteRequestEntity,
    ]),
    WalletCoreModule,
  ],
  controllers: [AdminOrderController],
  providers: [AdminOrderService, OrderBookService],
  exports: [AdminOrderService],
})
export class AdminOrderModule {}
