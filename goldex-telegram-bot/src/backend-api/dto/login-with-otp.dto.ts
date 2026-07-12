import { IsString, Matches } from 'class-validator';

export class LoginWithOtpDto {
  @IsString()
  @Matches(/^09[0-9]{9}$/, { message: 'Invalid Iranian phone number' })
  phone: string;

  @IsString()
  @Matches(/^\d{5}$/, { message: 'OTP must be 5 digits' })
  otp: string;
}
