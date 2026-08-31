import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CbpMessagePatterns,
  PaymentCallbackMessage,
  RabbitMQMessage,
} from "../../rabbitmq/rabbitmq.interfaces";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import { PaymentsService } from "../payments.service";

/**
 * RabbitMQ handler for provider callbacks. goldex-cbp stays headless —
 * goldex-backend receives the external callback and forwards it here via
 * `payment.callback`, keeping all HTTP entry points out of cbp.
 */
@Injectable()
export class KainoCallbackConsumer implements OnModuleInit {
  private readonly logger = new Logger(KainoCallbackConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.rabbit.subscribe(CbpMessagePatterns.PAYMENT_CALLBACK, (msg) =>
      void this.handle(msg),
    );
    void this.rabbit.startConsuming();
  }

  private async handle(msg: RabbitMQMessage): Promise<void> {
    const { reference, body } = msg.data as PaymentCallbackMessage;
    const ref = reference ?? body?.identifier ?? body?.ipgReference;
    try {
      const result = await this.payments.handleKainoCallback(ref, body ?? {});
      this.logger.log(
        `Kaino callback handled | reference: ${ref} | result: ${JSON.stringify(result)}`,
      );
    } catch (err) {
      this.logger.error(
        `Kaino callback failed | reference: ${ref} | error: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}