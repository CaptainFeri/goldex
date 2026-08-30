// dto/adjust-balance.dto.ts
import { IsUUID, IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { BalanceAdjustTypeEnum } from "../enum/balance-adjust-type.enum";

export class AdjustBalanceDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty({ enum: BalanceAdjustTypeEnum })
  @IsEnum(BalanceAdjustTypeEnum)
  adjustType: BalanceAdjustTypeEnum;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  metadata?: any;
}
