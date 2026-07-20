import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { DepositStatusEnum } from "../enum/deposit-status.enum";

export class ProcessDepositDto {
  @IsEnum(DepositStatusEnum)
  @ApiProperty({ enum: DepositStatusEnum })
  status: DepositStatusEnum;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  notes?: string;
}
