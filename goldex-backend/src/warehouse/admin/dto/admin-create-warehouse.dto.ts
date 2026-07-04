import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsEnum, IsArray, IsOptional, Min, IsUUID } from "class-validator";
import { WarehouseStatusEnum } from "../../enum/warehouse-status.enum";

export class AdminCreateWarehouseDto {
  @ApiProperty({ description: "Warehouse name" })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "Warehouse description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: "Warehouse location" })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({ description: "Total capacity" })
  @IsNumber()
  @Min(0)
  capacityTotal: number;

  @ApiPropertyOptional({
    description: "Available delivery dates",
    type: [String],
  })
  @IsArray()
  @IsOptional()
  deliveryDates?: string[];

  @ApiPropertyOptional({ description: "Daily time limit" })
  @IsString()
  @IsOptional()
  timeLimit?: string;

  @ApiPropertyOptional({ enum: WarehouseStatusEnum })
  @IsEnum(WarehouseStatusEnum)
  @IsOptional()
  status?: WarehouseStatusEnum;
}
