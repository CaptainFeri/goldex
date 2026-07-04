import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsString, IsOptional } from "class-validator";

export class ConfirmMaterialDto {
  @ApiPropertyOptional({ description: "ANG (purity)" })
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional({ description: "AYAR" })
  @IsNumber()
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({ description: "Warehouse index position" })
  @IsString()
  @IsOptional()
  warehouseIndexPosition?: string;
}
