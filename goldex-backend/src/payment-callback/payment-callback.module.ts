import { Module } from "@nestjs/common";
import { PaymentBusModule } from "../payment-bus/payment-bus.module";
import { PaymentCallbackController } from "./payment-callback.controller";

@Module({
  imports: [PaymentBusModule],
  controllers: [PaymentCallbackController],
})
export class PaymentCallbackModule {}