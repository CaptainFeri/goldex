import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsUUID, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateSettlementPacketDto {
  @ApiProperty({ description: "Warehouse ID to store the packet" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ description: "Provider key (e.g. mock-zaryar-a)" })
  @IsString()
  providerKey: string;

  @ApiProperty({ description: "Pure weight of the material" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  pureWeight: number;

  @ApiPropertyOptional({ description: "Secure ID (auto-generated if not provided)" })
  @IsString()
  @IsOptional()
  idSecure?: string;

  @ApiPropertyOptional({ description: "ANG (purity)" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional({ description: "AYAR" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({ description: "Batch number" })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ description: "Warehouse index position" })
  @IsString()
  @IsOptional()
  warehouseIndexPosition?: string;
}
