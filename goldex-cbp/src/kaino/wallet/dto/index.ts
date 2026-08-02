export class ChargeWalletDto {
  identifier: string;
  bankDepositIdentifier?: string;
  tenant: string;
  amount: string | number;
  username?: string;
  payerMobileNumber?: string;
  accountNumber?: string;
  localDate: string;
  callBackUrl: string;
  voucherReference?: string;
  autoVerify?: boolean;
  validCards?: string[];
  description?: string;
}

export class VerifyChargeDto {
  tenant: string;
  identifier: string;
  amount: string | number;
  reference: string;
  stan?: string;
  isVerify: boolean;
}

export class PaymentOrderDto {
  sourceAccountNumber?: string;
  amount: string | number;
  beneficiaryId: string;
  beneficiaryName: string;
  beneficiaryIban: string;
  externalReference?: string;
  description?: string;
  username?: string;
  tenant: string;
  stan: string;
  localDate: string;
}

export class TransferDto {
  tenant: string;
  channel?: string;
  fromAccountNumber?: string;
  fromUsername?: string;
  fromUsernameTenant?: string;
  toAccountNumber?: string;
  toUsername?: string;
  toUsernameTenant?: string;
  facilityId: string;
  currency: string;
  amount: string | number;
  identifier: string;
  description?: string;
  stan: string;
  localDate: string;
  person?: boolean;
  isCfmTransaction?: boolean;
  bankIban?: string;
}

export class InquiryDto {
  localDate: string;
  stan: string;
  tenant: string;
}

export class ReverseDto {
  amount: string | number;
  localDate: string;
  stan: string;
  tenant: string;
}
