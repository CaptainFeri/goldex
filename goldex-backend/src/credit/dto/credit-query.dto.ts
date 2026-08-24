import { IsOptional, IsEnum, IsUUID, IsString, IsDateString, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { SettlementStateEnum } from "../enum/settlement-state.enum";
import { RiskStateEnum } from "../enum/risk-state.enum";

export class CreditQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false, enum: CreditStatusEnum })
  @IsOptional()
  @IsEnum(CreditStatusEnum)
  status?: CreditStatusEnum;

  @ApiProperty({ required: false, enum: SettlementStateEnum })
  @IsOptional()
  @IsEnum(SettlementStateEnum)
  settlementState?: SettlementStateEnum;

  @ApiProperty({ required: false, enum: RiskStateEnum })
  @IsOptional()
  @IsEnum(RiskStateEnum)
  riskState?: RiskStateEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
