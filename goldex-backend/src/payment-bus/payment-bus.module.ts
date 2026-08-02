import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { DepositEntity } from "../deposit/deposit.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { PaymentEventConsumer } from "./consumers/payment-event.consumer";
import { PaymentEventService } from "./payment-event.service";
import { PaymentBusService } from "./payment-bus.service";

/**
 * Bridge to goldex-cbp: publishes payment commands and symbol syncs, and
 * consumes payment lifecycle events (wallet credit/deduct + status sync).
 * RabbitMQModule is global.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepositEntity,
      WithdrawEntity,
      SymbolEntity,
      WalletEntity,
      TransactionEntity,
    ]),
  ],
  providers: [PaymentBusService, PaymentEventService, PaymentEventConsumer],
  exports: [PaymentBusService],
})
export class PaymentBusModule {}
