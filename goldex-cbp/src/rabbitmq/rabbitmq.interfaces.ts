export enum CbpMessagePatterns {
  // Commands received from goldex-backend
  PAYMENT_REQUEST_DEPOSIT = "payment.request.deposit",
  PAYMENT_REQUEST_WITHDRAW = "payment.request.withdraw",
  PAYMENT_REQUEST_WITHDRAW_APPROVE = "payment.request.withdraw.approve",
  SYMBOL_SYNC = "symbol.sync",

  // Events published to goldex-backend
  PAYMENT_PROCESSING = "payment.processing",
  PAYMENT_SUCCEEDED = "payment.succeeded",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_REJECTED = "payment.rejected",
}

export interface RabbitMQMessage {
  pattern: string;
  data: any;
  timestamp: string;
  providerKey?: string;
}

/**
 * Command payload from goldex-backend. `externalReference` is the
 * backend deposit/withdraw entity id this payment belongs to.
 */
export interface PaymentRequestMessage {
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
  // withdraw only
  beneficiaryIban?: string;
  beneficiaryName?: string;
  beneficiaryId?: string;
}

export interface WithdrawApproveMessage {
  externalReference: string;
  adminId: string;
}

/** Symbol config synced from goldex-backend (admin panel edits). */
export interface SymbolSyncMessage {
  slug: string;
  name: string;
  symbolType: string;
  hasPaymentGateway: boolean;
  isActive: boolean;
  depositTypes: string[];
  withdrawTypes: string[];
  depositGateways: string[];
  withdrawGateways: string[];
  defaultDepositGateway?: string;
  defaultWithdrawGateway?: string;
}

/** Event payload published back to goldex-backend. */
export interface PaymentEventMessage {
  paymentId: string;
  externalReference: string;
  userId: string;
  operation: "deposit" | "withdraw";
  status: string;
  amount: number | string;
  currency?: string;
  gatewayCode?: string;
  identifier?: string;
  ipgReference?: string;
  gatewayUrl?: string;
  error?: string;
}
