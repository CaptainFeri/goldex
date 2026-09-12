import { IsOptional, IsEnum, IsUUID, IsString, IsDateString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { FinanceActionEnum } from "../enum/finance-action.enum";

export class FinanceLogQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, enum: FinanceActionEnum })
  @IsOptional()
  @IsEnum(FinanceActionEnum)
  actionType?: FinanceActionEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  format?: "json" | "excel";
}
