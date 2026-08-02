import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CbpMessagePatterns,
  PaymentRequestMessage,
  RabbitMQMessage,
  WithdrawApproveMessage,
} from "../../rabbitmq/rabbitmq.interfaces";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import { PaymentsService } from "../payments.service";

/**
 * Consumes `payment.request.*` commands published by goldex-backend.
 * Failures are handled inside PaymentsService (payment marked FAILED and
 * a `payment.failed` event published), so messages are always acked to
 * avoid poison-message redelivery loops.
 */
@Injectable()
export class PaymentRequestConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentRequestConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly paymentsService: PaymentsService,
  ) {}

  onModuleInit(): void {
    this.rabbit.subscribe(
      CbpMessagePatterns.PAYMENT_REQUEST_DEPOSIT,
      (msg) => void this.onDeposit(msg),
    );
    this.rabbit.subscribe(
      CbpMessagePatterns.PAYMENT_REQUEST_WITHDRAW,
      (msg) => void this.onWithdraw(msg),
    );
    this.rabbit.subscribe(
      CbpMessagePatterns.PAYMENT_REQUEST_WITHDRAW_APPROVE,
      (msg) => void this.onWithdrawApprove(msg),
    );
    void this.rabbit.startConsuming();
  }

  private async onDeposit(msg: RabbitMQMessage): Promise<void> {
    try {
      const cmd = msg.data as PaymentRequestMessage;
      await this.paymentsService.createDepositFromCommand(cmd);
      this.logger.log(
        `Deposit request handled | externalReference: ${cmd.externalReference}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to handle deposit request: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private async onWithdraw(msg: RabbitMQMessage): Promise<void> {
    try {
      const cmd = msg.data as PaymentRequestMessage;
      await this.paymentsService.createWithdrawFromCommand(cmd);
      this.logger.log(
        `Withdraw request handled | externalReference: ${cmd.externalReference}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to handle withdraw request: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  private async onWithdrawApprove(msg: RabbitMQMessage): Promise<void> {
    try {
      const cmd = msg.data as WithdrawApproveMessage;
      const payment = await this.paymentsService.approveWithdrawByExternalReference(
        cmd.externalReference,
        cmd.adminId,
      );
      this.logger.log(
        `Withdraw approved | externalReference: ${cmd.externalReference} | status: ${payment.status}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to approve withdraw: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
