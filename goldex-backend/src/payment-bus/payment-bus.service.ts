import { Injectable, Logger } from "@nestjs/common";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns, RabbitMQMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";

/**
 * Publishes payment commands to goldex-cbp and syncs symbol config.
 * goldex-cbp is a separate service with its own queue on the same
 * topic exchange; published messages only reach it.
 */
@Injectable()
export class PaymentBusService {
  private readonly logger = new Logger(PaymentBusService.name);

  constructor(private readonly rmq: RabbitMQService) {}

  private publish(pattern: string, data: Record<string, any>): void {
    const message: RabbitMQMessage = {
      pattern,
      data,
      timestamp: new Date().toISOString(),
    };
    this.rmq.publish(pattern, message);
  }

  requestDeposit(data: {
    externalReference: string;
    userId: string;
    symbolSlug: string;
    symbolType: string;
    type: string;
    amount: number | string;
    currency?: string;
    gatewayCode?: string;
    picturePath?: string;
    notes?: string;
    metadata?: Record<string, any>;
  }): void {
    this.publish(MessagePatterns.PAYMENT_REQUEST_DEPOSIT, data);
  }

  requestWithdraw(data: {
    externalReference: string;
    userId: string;
    symbolSlug: string;
    symbolType: string;
    type: string;
    amount: number | string;
    currency?: string;
    gatewayCode?: string;
    picturePath?: string;
    notes?: string;
    metadata?: Record<string, any>;
    beneficiaryIban?: string;
    beneficiaryName?: string;
    beneficiaryId?: string;
  }): void {
    this.publish(MessagePatterns.PAYMENT_REQUEST_WITHDRAW, data);
  }

  approveWithdraw(externalReference: string, adminId: string): void {
    this.publish(MessagePatterns.PAYMENT_REQUEST_WITHDRAW_APPROVE, {
      externalReference,
      adminId,
    });
  }

  syncSymbol(symbol: SymbolEntity): void {
    this.publish(MessagePatterns.SYMBOL_SYNC, {
      slug: symbol.slug,
      name: symbol.name,
      symbolType: symbol.symbolType,
      hasPaymentGateway: symbol.hasPaymentGateway,
      isActive: symbol.isActive,
      depositTypes: symbol.depositTypes ?? [],
      withdrawTypes: symbol.withdrawTypes ?? [],
      depositGateways: symbol.depositGateways ?? [],
      withdrawGateways: symbol.withdrawGateways ?? [],
      defaultDepositGateway: symbol.defaultDepositGateway ?? undefined,
      defaultWithdrawGateway: symbol.defaultWithdrawGateway ?? undefined,
    });
  }
}
