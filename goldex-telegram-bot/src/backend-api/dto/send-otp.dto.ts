import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^09[0-9]{9}$/, { message: 'Invalid Iranian phone number' })
  phone: string;
}
