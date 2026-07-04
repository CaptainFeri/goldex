import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsEnum, IsArray, IsOptional, Min } from "class-validator";
import { WarehouseStatusEnum } from "../../enum/warehouse-status.enum";

export class AdminUpdateWarehouseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  capacityTotal?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  deliveryDates?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  timeLimit?: string;

  @ApiPropertyOptional({ enum: WarehouseStatusEnum })
  @IsEnum(WarehouseStatusEnum)
  @IsOptional()
  status?: WarehouseStatusEnum;
}
