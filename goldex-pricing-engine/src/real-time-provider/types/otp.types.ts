import { ProviderEntity } from '../entity/provider.entity';

export interface OtpResult {
  token: string;
  extra?: Record<string, any>;
}

export interface OtpHandler {
  sendOtp(provider: ProviderEntity, phone: string): Promise<void>;
  verifyOtp(provider: ProviderEntity, otp: string): Promise<OtpResult>;
}

export interface SendOtpInput {
  phone: string;
}

export interface VerifyOtpInput {
  otp: string;
}
