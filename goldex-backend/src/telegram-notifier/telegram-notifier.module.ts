import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TelegramNotifierService } from "./telegram-notifier.service";

@Module({
  imports: [HttpModule],
  providers: [TelegramNotifierService],
  exports: [TelegramNotifierService],
})
export class TelegramNotifierModule {}
