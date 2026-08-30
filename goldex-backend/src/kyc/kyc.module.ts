import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { KycService } from "./services/kyc.service";
import { KycController } from "./controllers/kyc.controller";
import { JibitProvider } from "./providers/jibit/jibit.provider";
import { ProviderRegistryService } from "./providers/provider-registry.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  // controllers: [KycController],
  providers: [KycService, ProviderRegistryService, JibitProvider],
  exports: [KycService],
})
export class KycModule {}
