// modules/sms/sms.module.ts
import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SmsService } from "./sms.service";
import { SmsProviderFactory } from "./providers/sms-provider.factory";
import { KavenegarProvider } from "./providers/kavenegar.provider";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    KavenegarProvider,
    SmsProviderFactory,
    SmsService,
    {
      provide: "SMS_PROVIDER",
      useFactory: (factory: SmsProviderFactory) => factory.getProvider(),
      inject: [SmsProviderFactory],
    },
  ],
  exports: [SmsService, "SMS_PROVIDER"],
})
export class SmsModule {}
