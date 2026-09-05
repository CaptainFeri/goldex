import { IsUUID, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CancelCreditDto {
  @ApiProperty()
  @IsUUID()
  creditId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
