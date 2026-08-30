import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsEnum, IsString } from "class-validator";
import { WarehouseStatusEnum } from "../enum/warehouse-status.enum";

export class WarehouseQueryDto {
  @ApiPropertyOptional({ enum: WarehouseStatusEnum })
  @IsEnum(WarehouseStatusEnum)
  @IsOptional()
  status?: WarehouseStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  offset?: string;
}
