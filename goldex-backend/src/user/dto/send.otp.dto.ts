import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class SendOtpPhoneDto {
  @ApiProperty({ example: "09123456789" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "Invalid Iranian phone number" })
  phone: string;
}
