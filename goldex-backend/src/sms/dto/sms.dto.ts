import { IsString, IsNotEmpty, IsOptional, Length, Matches } from "class-validator";

export class SendSmsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "Invalid Iranian mobile number format" })
  to: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 500)
  message: string;
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "Invalid Iranian mobile number format" })
  to: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 6)
  token: string;

  @IsString()
  @IsOptional()
  template?: string;

  @IsOptional()
  options?: {
    validityPeriod?: number;
    tokenName?: string;
  };
}
