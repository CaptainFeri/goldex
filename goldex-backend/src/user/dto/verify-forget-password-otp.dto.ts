import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

/**
 * Step 2 of SMS password recovery: the code that arrived by SMS. Answering
 * correctly yields a short-lived reset token, which is the bearer credential
 * for `POST /auth/reset-password`.
 */
export class VerifyForgetPasswordOtpDto {
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
