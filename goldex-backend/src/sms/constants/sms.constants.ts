export const SMS_PROVIDER_TOKEN = "SMS_PROVIDER";
export const SMS_MODULE_OPTIONS = "SMS_MODULE_OPTIONS";

export const SMS_PROVIDERS = {
  KAVENEGAR: "kavenegar",
  TWILIO: "twilio",
  SMSPANEL: "smspanel",
} as const;

export type SmsProviderType = (typeof SMS_PROVIDERS)[keyof typeof SMS_PROVIDERS];
