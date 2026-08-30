import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class VerifyAdminOtpDto {
  @ApiProperty({ example: "09123456789", description: "Iranian mobile number" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "PHONE.INVALID" })
  phone: string;

  @ApiProperty({ example: "12345", description: "5-digit OTP code" })
  @IsString()
  @IsNotEmpty()
  @Length(5, 5, { message: "OTP.INVALID_FORMAT" })
  otp: string;
}
