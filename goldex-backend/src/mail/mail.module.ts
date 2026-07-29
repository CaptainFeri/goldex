import { Module } from "@nestjs/common";
import { MailgunMailService } from "./providers/mailgun-mail.service";
import { MailStrategyService } from "./strategy/mail-strategy.service";

@Module({
  providers: [MailgunMailService, MailStrategyService],
  exports: [MailStrategyService],
})
export class MailModule {}
