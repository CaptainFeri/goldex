import { Module } from "@nestjs/common";
import { PaymentsModule } from "../payments.module";
import { SymbolsModule } from "../../symbols/symbols.module";
import { PaymentRequestConsumer } from "./payment-request.consumer";
import { SymbolSyncConsumer } from "./symbol-sync.consumer";
import { PaymentsService } from "../payments.service";

/**
 * Wires cbp's RabbitMQ consumers against the shared PaymentsModule and
 * SymbolsModule. RabbitMQModule is global (registered in AppModule).
 */
@Module({
  imports: [PaymentsModule, SymbolsModule],
  providers: [PaymentRequestConsumer, PaymentsService, SymbolSyncConsumer],
})
export class PaymentBusModule {}
