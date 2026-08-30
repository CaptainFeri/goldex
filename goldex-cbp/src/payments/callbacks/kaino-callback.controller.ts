import { Body, Controller, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PaymentsService } from "../payments.service";

/**
 * Kaino IPG redirects the payer back to this endpoint after a
 * chargeWallet attempt. The payment is then verified against Kaino
 * (chargeWallet/verify) before being marked as succeeded.
 */
@ApiTags("Payments callbacks")
@Controller("payments/callbacks/kaino")
export class KainoCallbackController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  handle(
    @Query("reference") reference: string,
    @Body() body: Record<string, any>,
  ) {
    const ref = reference ?? body?.identifier ?? body?.ipgReference;
    return this.paymentsService.handleKainoCallback(ref, body);
  }
}
