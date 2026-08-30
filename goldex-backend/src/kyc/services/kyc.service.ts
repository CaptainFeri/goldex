import { Injectable } from "@nestjs/common";
import { KycProviderType } from "../interfaces/kyc-provider.interface";
import { ProviderRegistryService } from "../providers/provider-registry.service";

@Injectable()
export class KycService {
  constructor(private readonly providerRegistry: ProviderRegistryService) {}

  private provider() {
    return this.providerRegistry.getProvider(KycProviderType.JIBIT);
  }

  matchMobile(nationalId: string, mobile: string) {
    return this.provider().matchMobileAndNationalId(nationalId, mobile);
  }

  verifyBankAccount(bank: string, depositNumber: string, nationalId: string, birthDate: string, iban: string) {
    return this.provider().verifyBankAccount(bank, depositNumber, nationalId, birthDate, iban);
  }

  getCardInfo(cardNumber: string) {
    return this.provider().getCardInfo(cardNumber);
  }

  getIbanInfo(iban: string) {
    return this.provider().getIbanInfo(iban);
  }
}
