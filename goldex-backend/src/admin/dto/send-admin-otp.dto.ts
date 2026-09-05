import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MinLength } from "class-validator";

export class SendAdminOtpDto {
  @ApiProperty({ example: "09123456789", description: "Iranian mobile number" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "PHONE.INVALID" })
  phone: string;

  @ApiProperty({ example: "strong-password", description: "Admin login password" })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
