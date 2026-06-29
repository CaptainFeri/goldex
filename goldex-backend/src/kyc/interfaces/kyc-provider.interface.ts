export enum KycProviderType {
  JIBIT = "JIBIT",
}

export interface IKycProvider {
  readonly provider: KycProviderType;

  getAccessToken(): Promise<string>;

  matchMobileAndNationalId(nationalId: string, mobile: string): Promise<boolean>;

  verifyBankAccount(
    bank: string,
    depositNumber: string,
    nationalId: string,
    birthDate: string,
    iban: string
  ): Promise<boolean>;

  getCardInfo(cardNumber: string): Promise<any>;

  getIbanInfo(iban: string): Promise<any>;
}
