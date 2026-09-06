import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

/** Step 1 of SMS password recovery: who is asking, by phone number. */
export class ForgetPasswordDto {
  @ApiProperty({ example: "09123456789" })
  @IsString()
  @IsNotEmpty()
  @Matches(/^09[0-9]{9}$/, { message: "Invalid Iranian phone number" })
  phone: string;
}
