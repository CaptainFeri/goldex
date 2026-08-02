import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { SignatureService } from "../common/signature/signature.service";
import { KainoAuthService } from "./auth/kaino-auth.service";
import { KainoHttpClient } from "./kaino-http.client";
import { KainoWalletService } from "./wallet/kaino-wallet.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 60_000,
      maxRedirects: 0,
    }),
  ],
  providers: [KainoHttpClient, KainoAuthService, KainoWalletService, SignatureService],
  exports: [KainoHttpClient, KainoAuthService, KainoWalletService, SignatureService],
})
export class KainoModule {}
