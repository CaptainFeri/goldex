import { Module } from "@nestjs/common";
import { ExampleService } from "./example/example.service";
import { MailgunMailService } from "./providers/mailgun-mail.service";
import { MailStrategyService } from "./strategy/mail-strategy.service";

@Module({
  providers: [MailgunMailService, MailStrategyService, ExampleService],
  // controllers: [ExampleController],
  exports: [MailStrategyService],
})
export class MailModule {}
