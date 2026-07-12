import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class LoginWithOtpDto {
  @ApiProperty({ example: "09123456789" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "Invalid Iranian phone number" })
  phone: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5}$/, { message: "OTP must be 5 digits" })
  otp: string;
}
