export interface SmsProvider {
  sendSMS(to: string, message: string): Promise<SmsResponse>;
  sendOTP(to: string, code: string, template?: string): Promise<SmsResponse>;
  getProviderName(): string;
}

export interface SmsResponse {
  success: boolean;
  messageId?: string;
  provider?: string;
  data?: any;
  error?: string;
}
