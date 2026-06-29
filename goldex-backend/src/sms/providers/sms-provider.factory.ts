// modules/sms/sms-provider.factory.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SmsProvider } from "../interfaces/sms-provider.interface";
import { KavenegarProvider } from "./kavenegar.provider";

@Injectable()
export class SmsProviderFactory {
  private readonly logger = new Logger(SmsProviderFactory.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly kavenegarProvider: KavenegarProvider
  ) {}

  getProvider(providerType?: string): SmsProvider {
    const activeProvider = providerType || this.configService.get<string>("SMS_PROVIDER", "kavenegar");

    this.logger.log(`Using SMS provider: ${activeProvider}`);

    switch (activeProvider) {
      case "kavenegar":
        return this.kavenegarProvider;
      // Add other providers here
      default:
        return this.kavenegarProvider;
    }
  }
}
