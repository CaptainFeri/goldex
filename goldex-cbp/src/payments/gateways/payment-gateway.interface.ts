import { PaymentCategoryEnum } from "../enum/payment-category.enum";
import { PaymentGatewayKindEnum } from "../enum/payment-gateway-kind.enum";

export interface DepositParams {
  amount: number | string;
  userId: string;
  reference: string;
  callbackUrl?: string;
  meta?: Record<string, any>;
}

export interface WithdrawParams {
  amount: number | string;
  userId: string;
  iban: string;
  beneficiaryName: string;
  beneficiaryId: string;
  reference: string;
  meta?: Record<string, any>;
}

export interface GatewayMetadata {
  code: string;
  name: string;
  category: PaymentCategoryEnum;
  kind: PaymentGatewayKindEnum;
}

/** Minimal payment projection needed by gateways for verify / inquiry. */
export interface GatewayPaymentRef {
  identifier: string;
  stan?: string;
  amount: number | string;
  metadata?: Record<string, any>;
}

export interface GatewayVerifyResult {
  success: boolean;
  raw?: any;
  error?: string;
}

export type GatewayHealthStatus = "up" | "down" | "not_configured" | "unknown";

export interface GatewayHealthResult {
  code: string;
  name: string;
  category: PaymentCategoryEnum;
  kind: PaymentGatewayKindEnum;
  status: GatewayHealthStatus;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface IPaymentGateway {
  readonly metadata: GatewayMetadata;
  deposit(params: DepositParams): Promise<any>;
  withdraw(params: WithdrawParams): Promise<any>;
  verify?(
    payment: GatewayPaymentRef,
    data: Record<string, any>,
  ): Promise<GatewayVerifyResult>;
  inquiry?(payment: GatewayPaymentRef): Promise<GatewayVerifyResult>;
  healthCheck?(): Promise<GatewayHealthResult>;
}
