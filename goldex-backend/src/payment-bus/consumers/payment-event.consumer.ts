import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import {
  MessagePatterns,
  PaymentEventMessage,
  RabbitMQMessage,
} from "../../rabbitmq/interfaces/rabbitmq.interfaces";
import { PaymentEventService } from "../payment-event.service";

/**
 * Consumes payment lifecycle events from goldex-cbp and applies them to
 * backend deposit/withdraw records and wallets. Events are acked by the
 * RabbitMQ service; failures are logged here (handlers are idempotent,
 * so redelivery would only be safe, but the broker acks eagerly).
 */
@Injectable()
export class PaymentEventConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly eventService: PaymentEventService,
  ) {}

  async onModuleInit(): Promise<void> {
    const handlers = [
      MessagePatterns.PAYMENT_PROCESSING,
      MessagePatterns.PAYMENT_SUCCEEDED,
      MessagePatterns.PAYMENT_FAILED,
      MessagePatterns.PAYMENT_REJECTED,
    ];
    for (const pattern of handlers) {
      await this.rmq.subscribe(pattern, (msg: RabbitMQMessage) => {
        void this.handle(msg);
      });
    }
    await this.rmq.startConsuming();
  }

  private async handle(msg: RabbitMQMessage): Promise<void> {
    const event = msg.data as PaymentEventMessage;
    try {
      await this.eventService.handleEvent(event);
      this.logger.log(
        `Payment event applied | pattern: ${msg.pattern} | externalReference: ${event.externalReference} | status: ${event.status}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to apply payment event | externalReference: ${event.externalReference} | status: ${event.status} | error: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
