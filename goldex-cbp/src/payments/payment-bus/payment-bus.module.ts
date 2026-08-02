import { Module } from "@nestjs/common";
import { PaymentRequestConsumer } from "./payment-request.consumer";
import { SymbolSyncConsumer } from "./symbol-sync.consumer";

/**
 * Wires cbp's RabbitMQ consumers against the shared PaymentsModule.
 * RabbitMQModule is global (registered in AppModule).
 */
@Module({
  providers: [PaymentRequestConsumer, SymbolSyncConsumer],
})
export class PaymentBusModule {}
