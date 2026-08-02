import { Body, Controller, Logger, Post, Query } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { lastValueFrom } from "rxjs";

/**
 * Public entry point for payment-provider callbacks.
 *
 * Kaino IPG redirects the payer's browser (or posts) here because the
 * callback URL is built from the publicly reachable backend URL — the
 * internal goldex-cbp service is never exposed. The request is forwarded
 * to goldex-cbp, which verifies the payment and publishes lifecycle events.
 */
@Controller("payments/callbacks/kaino")
export class PaymentCallbackController {
  private readonly logger = new Logger(PaymentCallbackController.name);
  private readonly cbpUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const base = this.config.get("cbp", { infer: true }).url;
    this.cbpUrl = `${base}/api/v1/payments/callbacks/kaino`;
  }

  @Post()
  async handle(
    @Query() query: Record<string, any>,
    @Body() body: Record<string, any>,
  ): Promise<any> {
    this.logger.log(
      `Forwarding Kaino callback to cbp: ${this.cbpUrl} (query: ${JSON.stringify(query)})`,
    );
    const { data } = await lastValueFrom(
      this.http.post(this.cbpUrl, body ?? {}, { params: query }),
    );
    return data;
  }
}
