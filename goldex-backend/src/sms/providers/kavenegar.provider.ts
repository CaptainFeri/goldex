// modules/sms/providers/kavenegar.provider.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Kavenegar from "kavenegar";
import { SmsProvider, SmsResponse } from "../interfaces/sms-provider.interface";

@Injectable()
export class KavenegarProvider implements SmsProvider {
  private readonly logger = new Logger(KavenegarProvider.name);
  private readonly api: any;
  private readonly sender: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("KAVENEGAR_API_KEY");
    this.sender = this.configService.get<string>("KAVENEGAR_SENDER", "10004340");

    if (!this.apiKey || this.apiKey === "test-key") {
      this.logger.warn("KAVENEGAR_API_KEY not configured, running in development mode");
    }

    if (this.apiKey && this.apiKey !== "test-key") {
      this.api = Kavenegar.KavenegarApi({ apikey: this.apiKey });
    }

    this.logger.log(`Kavenegar provider initialized with sender: ${this.sender}`);
  }

  getProviderName(): string {
    return "kavenegar";
  }

  async sendSMS(to: string, message: string): Promise<SmsResponse> {
    try {
      this.validatePhoneNumber(to);

      // Development mode simulation
      if (!this.apiKey || this.apiKey === "test-key") {
        return this.simulateSms(to, message);
      }

      const result = await new Promise((resolve, reject) => {
        this.api.Send(
          {
            message,
            sender: this.sender,
            receptor: to,
          },
          (response: any, status: number) => {
            if (status === 200 && response?.entries?.length > 0) {
              resolve(response);
            } else {
              reject(new Error(`Kavenegar API error: ${JSON.stringify(response)}`));
            }
          }
        );
      });

      this.logger.log(`SMS sent successfully to ${to}`);

      return {
        success: true,
        messageId: (result as any).entries?.[0]?.messageid?.toString(),
        provider: this.getProviderName(),
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
      return {
        success: false,
        provider: this.getProviderName(),
        error: error.message,
      };
    }
  }

  async sendOTP(to: string, code: string, template: string = "verify"): Promise<SmsResponse> {
    try {
      this.validatePhoneNumber(to);
      this.validateCode(code);

      // Development mode simulation
      if (!this.apiKey || this.apiKey === "test-key") {
        return this.simulateOtp(to, code);
      }

      // Try template-based OTP first
      const result = await new Promise((resolve, reject) => {
        this.api.VerifyLookup(
          {
            receptor: to,
            token: code,
            template: template,
          },
          (response: any, status: number) => {
            if (status === 200) {
              resolve(response);
            } else {
              reject(new Error(`OTP template failed: ${JSON.stringify(response)}`));
            }
          }
        );
      });

      this.logger.log(`OTP sent successfully to ${to} using template: ${template}`);

      return {
        success: true,
        messageId: (result as any).entries?.[0]?.messageid?.toString(),
        provider: this.getProviderName(),
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send OTP to ${to}: ${error.message}`);

      // Fallback to regular SMS
      try {
        this.logger.warn(`Falling back to regular SMS for OTP to ${to}`);
        const message = `کد تایید شما: ${code}`;
        return await this.sendSMS(to, message);
      } catch (fallbackError: any) {
        return {
          success: false,
          provider: this.getProviderName(),
          error: fallbackError.message,
        };
      }
    }
  }

  private validatePhoneNumber(phoneNumber: string): void {
    if (!phoneNumber || !phoneNumber.trim()) {
      throw new Error("Phone number is required");
    }

    // Iranian mobile number validation
    const cleaned = phoneNumber.replace(/\s/g, "");
    const iranMobileRegex = /^(09|9)[0-9]{9}$/;

    if (!iranMobileRegex.test(cleaned)) {
      throw new Error("Invalid Iranian mobile number format");
    }
  }

  private validateCode(code: string): void {
    if (!code || !code.trim()) {
      throw new Error("OTP code is required");
    }

    if (code.length < 4 || code.length > 6) {
      this.logger.warn(`Unusual OTP code length: ${code.length} digits`);
    }
  }

  private async simulateSms(to: string, message: string): Promise<SmsResponse> {
    this.logger.debug(`[DEV MODE] Simulating SMS to ${to}: ${message.substring(0, 50)}...`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      messageId: `sim_${Date.now()}`,
      provider: this.getProviderName(),
      data: { simulated: true, receptor: to, message },
    };
  }

  private async simulateOtp(to: string, code: string): Promise<SmsResponse> {
    this.logger.debug(`[DEV MODE] Simulating OTP to ${to}: Code=${code}`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      messageId: `otp_sim_${Date.now()}`,
      provider: this.getProviderName(),
      data: { simulated: true, receptor: to, code },
    };
  }
}
