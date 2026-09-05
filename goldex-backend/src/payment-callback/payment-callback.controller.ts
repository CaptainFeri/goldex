import { Body, Controller, Logger, Post, Query } from "@nestjs/common";
import { PaymentBusService } from "../payment-bus/payment-bus.service";

/**
 * Public entry point for payment-provider callbacks.
 *
 * Kaino IPG redirects the payer's browser (or posts) here because the
 * callback URL is built from the publicly reachable backend URL. The
 * backend only relays the callback to goldex-cbp over RabbitMQ
 * (`payment.callback`) — goldex-cbp has no HTTP surface of its own.
 */
@Controller("payments/callbacks/kaino")
export class PaymentCallbackController {
  private readonly logger = new Logger(PaymentCallbackController.name);

  constructor(private readonly bus: PaymentBusService) {}

  @Post()
  handle(
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ): any {
    const reference =
      query?.reference ?? body?.identifier ?? body?.ipgReference;
    this.logger.log(
      `Relaying Kaino callback to cbp over RabbitMQ | reference: ${reference} | query: ${JSON.stringify(query)}`,
    );
    this.bus.forwardCallback(reference, body ?? {});
    return { success: true, received: true };
  }
}