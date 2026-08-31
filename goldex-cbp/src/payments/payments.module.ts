import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolsModule } from "../symbols/symbols.module";
import { CbpAdminConsumer } from "./admin/cbp-admin.consumer";
import { CbpAdminService } from "./admin/cbp-admin.service";
import { KainoCallbackConsumer } from "./callbacks/kaino-callback.consumer";
import { PaymentEntity } from "./entity/payment.entity";
import { GatewaysModule } from "./gateways/gateways.module";
import { PaymentEventsService } from "./payment-events.service";
import { PaymentsService } from "./payments.service";

/**
 * Headless payment engine: no HTTP surface at all. Everything is driven
 * by RabbitMQ commands from goldex-backend, including provider callbacks.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity]),
    SymbolsModule,
    GatewaysModule,
  ],
  providers: [
    PaymentsService,
    PaymentEventsService,
    CbpAdminService,
    CbpAdminConsumer,
    KainoCallbackConsumer,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
