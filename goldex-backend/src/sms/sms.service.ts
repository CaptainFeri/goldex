// modules/sms/sms.service.ts
import { Injectable, Logger, Inject } from "@nestjs/common";
import { SmsProvider, SmsResponse } from "./interfaces/sms-provider.interface";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(@Inject("SMS_PROVIDER") private readonly smsProvider: SmsProvider) {}

  async sendSMS(to: string, message: string): Promise<SmsResponse> {
    this.logger.log(`Sending SMS to ${to}`);
    return this.smsProvider.sendSMS(to, message);
  }

  async sendOTP(to: string, code: string, template?: string): Promise<SmsResponse> {
    this.logger.log(`Sending OTP to ${to}`);
    return this.smsProvider.sendOTP(to, code, template);
  }

  getProviderName(): string {
    return this.smsProvider.getProviderName();
  }
}
