export enum CbpMessagePatterns {
  // Commands received from goldex-backend
  PAYMENT_REQUEST_DEPOSIT = "payment.request.deposit",
  PAYMENT_REQUEST_WITHDRAW = "payment.request.withdraw",
  PAYMENT_REQUEST_WITHDRAW_APPROVE = "payment.request.withdraw.approve",
  SYMBOL_SYNC = "symbol.sync",
  PAYMENT_CALLBACK = "payment.callback",

  // Admin queries from goldex-backend (RabbitMQ RPC: request -> response)
  CBP_ADMIN_REQUEST = "cbp.admin.request",
  CBP_ADMIN_RESPONSE = "cbp.admin.response",

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

/** Provider callback forwarded from goldex-backend over RabbitMQ. */
export interface PaymentCallbackMessage {
  reference?: string;
  body: Record<string, any>;
}

/** Admin query received from goldex-backend over RabbitMQ. */
export interface CbpAdminRequestMessage {
  requestId: string;
  action: "health" | "gateways" | "payments" | "payment";
  params?: Record<string, any>;
}

/** Admin query reply published back to goldex-backend. */
export interface CbpAdminResponseMessage {
  requestId: string;
  ok: boolean;
  result?: any;
  error?: string;
}
