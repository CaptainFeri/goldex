import { IsOptional, IsEnum, IsUUID, IsString, IsDateString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { CreditActionEnum } from "../../credit/enum/credit-action.enum";

export class FinanceLogQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, enum: CreditActionEnum })
  @IsOptional()
  @IsEnum(CreditActionEnum)
  actionType?: CreditActionEnum;

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
