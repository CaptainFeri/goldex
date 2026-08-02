import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SymbolsModule } from "../symbols/symbols.module";
import { KainoCallbackController } from "./callbacks/kaino-callback.controller";
import { PaymentEntity } from "./entity/payment.entity";
import { GatewaysModule } from "./gateways/gateways.module";
import { PaymentBusModule } from "./payment-bus/payment-bus.module";
import { PaymentEventsService } from "./payment-events.service";
import { PaymentsService } from "./payments.service";

/**
 * Headless payment engine: no user/admin HTTP surface. Everything is
 * driven by RabbitMQ commands from goldex-backend; the only HTTP entry
 * is the external payment-provider callback endpoint.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentEntity]),
    SymbolsModule,
    GatewaysModule,
    PaymentBusModule,
  ],
  providers: [PaymentsService, PaymentEventsService],
  controllers: [KainoCallbackController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
