import { Injectable, Logger } from "@nestjs/common";
import { CbpMessagePatterns, PaymentEventMessage, RabbitMQMessage } from "../rabbitmq/rabbitmq.interfaces";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { PaymentEntity } from "./entity/payment.entity";
import { PaymentOperationEnum } from "./enum/payment-operation.enum";

/**
 * Publishes payment lifecycle events to goldex-backend over RabbitMQ.
 * Only payments created from a backend command (externalReference set)
 * produce events — direct-HTTP payments stay silent.
 */
@Injectable()
export class PaymentEventsService {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(private readonly rabbit: RabbitMQService) {}

  private build(
    payment: PaymentEntity,
    status: string,
    error?: string,
  ): PaymentEventMessage {
    return {
      paymentId: payment.id,
      externalReference: payment.externalReference!,
      userId: payment.userId,
      operation:
        payment.operation === PaymentOperationEnum.DEPOSIT
          ? "deposit"
          : "withdraw",
      status,
      amount: payment.amount,
      currency: payment.currency,
      gatewayCode: payment.gatewayCode,
      identifier: payment.identifier,
      ipgReference: payment.ipgReference,
      gatewayUrl: payment.gatewayUrl,
      error,
    };
  }

  private publish(pattern: string, payment: PaymentEntity, error?: string): void {
    if (!payment.externalReference) return;
    const message: RabbitMQMessage = {
      pattern,
      data: this.build(payment, payment.status, error),
      timestamp: new Date().toISOString(),
    };
    void this.rabbit.publish(pattern, message);
  }

  processing(payment: PaymentEntity): void {
    this.publish(CbpMessagePatterns.PAYMENT_PROCESSING, payment);
  }

  succeeded(payment: PaymentEntity): void {
    this.publish(CbpMessagePatterns.PAYMENT_SUCCEEDED, payment);
  }

  failed(payment: PaymentEntity, error?: string): void {
    this.publish(CbpMessagePatterns.PAYMENT_FAILED, payment, error);
  }

  rejected(payment: PaymentEntity): void {
    this.publish(CbpMessagePatterns.PAYMENT_REJECTED, payment);
  }
}
