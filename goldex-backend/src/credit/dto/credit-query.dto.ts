import { IsOptional, IsEnum, IsUUID, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { CreditStatusEnum } from "../enum/credit-status.enum";

export class CreditQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false, enum: CreditStatusEnum })
  @IsOptional()
  @IsEnum(CreditStatusEnum)
  status?: CreditStatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
