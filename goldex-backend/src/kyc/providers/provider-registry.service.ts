import { Injectable, NotFoundException } from "@nestjs/common";
import { JibitProvider } from "./jibit/jibit.provider";
import { IKycProvider, KycProviderType } from "../interfaces/kyc-provider.interface";

@Injectable()
export class ProviderRegistryService {
  private readonly providers = new Map<KycProviderType, IKycProvider>();

  constructor(private readonly jibitProvider: JibitProvider) {
    this.providers.set(KycProviderType.JIBIT, this.jibitProvider);
  }

  getProvider(provider: KycProviderType): IKycProvider {
    const strategy = this.providers.get(provider);

    if (!strategy) {
      throw new NotFoundException(`Provider ${provider} not found`);
    }

    return strategy;
  }
}
