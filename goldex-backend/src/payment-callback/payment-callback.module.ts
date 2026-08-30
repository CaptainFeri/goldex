import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { PaymentCallbackController } from "./payment-callback.controller";

@Module({
  imports: [HttpModule],
  controllers: [PaymentCallbackController],
})
export class PaymentCallbackModule {}
