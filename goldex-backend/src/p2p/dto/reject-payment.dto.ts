import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class RejectPaymentDto {
  @IsString()
  @MinLength(3)
  @ApiProperty({ description: "Shown to the admin who picks up the escalation" })
  reason: string;
}
