import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsEnum, IsString, IsUUID } from "class-validator";
import { RequestTypeEnum } from "../../enum/request-type.enum";
import { RequestStatusEnum } from "../../enum/request-status.enum";

export class AdminRequestQueryDto {
  @ApiPropertyOptional({ enum: RequestTypeEnum })
  @IsEnum(RequestTypeEnum)
  @IsOptional()
  type?: RequestTypeEnum;

  @ApiPropertyOptional({ enum: RequestStatusEnum })
  @IsEnum(RequestStatusEnum)
  @IsOptional()
  status?: RequestStatusEnum;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  offset?: string;
}
