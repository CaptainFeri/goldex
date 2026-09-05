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
import { QuoteRequestEntity } from "../../quote-request/quote-request.entity";
import { WalletCoreModule } from "../../wallet/wallet-core.module";
import { CreditOrderEntity } from "../../credit/entity/credit-order.entity";
import { PairPoolStatusEntity } from "../../market-status/entity/pair-pool-status.entity";

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
      CreditOrderEntity,
      PairPoolStatusEntity,
    ]),
    WalletCoreModule,
  ],
  controllers: [AdminOrderController],
  providers: [AdminOrderService],
  exports: [AdminOrderService],
})
export class AdminOrderModule {}
