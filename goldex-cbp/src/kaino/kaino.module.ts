import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { buildHttpProxyConfig } from "../common/http/proxy.config";
import { SignatureService } from "../common/signature/signature.service";
import { KainoAuthService } from "./auth/kaino-auth.service";
import { KainoHttpClient } from "./kaino-http.client";
import { KainoWalletService } from "./wallet/kaino-wallet.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: 60_000,
        maxRedirects: 0,
        ...buildHttpProxyConfig(config),
      }),
    }),
  ],
  providers: [KainoHttpClient, KainoAuthService, KainoWalletService, SignatureService],
  exports: [KainoHttpClient, KainoAuthService, KainoWalletService, SignatureService],
})
export class KainoModule {}
