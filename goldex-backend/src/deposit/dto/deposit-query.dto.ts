import { IsOptional, IsString, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class DepositQueryDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiProperty({ required: false })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiProperty({ required: false })
  limit?: number;
}
