import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { SmsModule } from "../sms/sms.module";
import { OperationOtpController } from "./operation-otp.controller";
import { OperationOtpService } from "./operation-otp.service";
import { OperationOtpGuard } from "./guard/operation-otp.guard";

@Module({
  imports: [RedisModule, SmsModule],
  controllers: [OperationOtpController],
  providers: [OperationOtpService, OperationOtpGuard],
  // Exported so any module can put `@RequireOperationOtp(...)` on a route.
  exports: [OperationOtpService, OperationOtpGuard],
})
export class OperationOtpModule {}
