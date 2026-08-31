export class ChargeWalletDto {
  tenant: string;
  identifier: string;
  amount: string | number;
  callBackUrl: string;
  username?: string;
  currency?: string;
  localDate?: string;
}

export class VerifyChargeDto {
  identifier: string;
  tenant: string;
  amount: string | number;
  reference: string;
  isVerify?: boolean;
  stan?: string;
}

export class PaymentOrderDto {
  sourceAccountNumber: string;
  amount: string | number;
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryIban: string;
  description?: string;
  username?: string;
  tenant: string;
  stan: string;
  localDate: string;
}

export class TransferDto {
  tenant: string;
  currency: string;
  amount: string | number;
  identifier: string;
  stan: string;
  localDate: string;
  isCfmTransaction: boolean;
  fromUsername?: string;
  fromUsernameTenant?: string;
  fromAccountNumber?: string;
  toUsername?: string;
  toUsernameTenant?: string;
  toAccountNumber?: string;
  facilityId?: string;
  person?: string;
  description?: string;
  channel?: string;
  bankIban?: string;
}

export class ChangePasswordDto {
  oldPassword: string;
  password: string;
  passwordConfirm: string;
}

export interface PageQuery {
  from: number | string;
  size: number | string;
}

export class PaymentOrderQueryDto implements PageQuery {
  from: number | string;
  size: number | string;
  accountNumber?: string;
  username?: string;
  tenantCode?: string;
  state?: string;
  paymentReference?: string;
  fromAmount?: number | string;
  toAmount?: number | string;
  fromStateDate?: number | string;
  toStateDate?: number | string;
}

export class ChargeWalletQueryDto implements PageQuery {
  tenant: string;
  from: number | string;
  size: number | string;
  identifier?: string;
  ipgReference?: string;
  username?: string;
  statusType?: string;
  fromDate?: string;
  toDate?: string;
  fromAmount?: number | string;
  toAmount?: number | string;
}

export class TransactionQueryDto implements PageQuery {
  tenant: string;
  from: number | string;
  size: number | string;
  product?: string;
  fromDate?: string;
  toDate?: string;
  fromTransactionId?: number | string;
  toTransactionId?: number | string;
  transactionTypes?: string;
  voucherReference?: string;
  invoiceNumber?: string;
  includeDone?: boolean;
  includeCanceled?: boolean;
  includePending?: boolean;
  transactionSign?: string;
  ascending?: boolean;
}