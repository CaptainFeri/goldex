import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsUUID, IsOptional, Min, IsBoolean } from "class-validator";
import { Type, Transform } from "class-transformer";

export class AdminCreatePacketDto {
  @ApiProperty({ description: "Warehouse ID" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ description: "Pure weight of the packet" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  pureWeight: number;

  @ApiProperty({ description: "Secure ID for the packet" })
  @IsString()
  idSecure: string;

  @ApiPropertyOptional({ description: "Warehouse index position" })
  @IsString()
  @IsOptional()
  warehouseIndexPosition?: string;

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

  @ApiPropertyOptional({ description: "Picture file path" })
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiPropertyOptional({ description: "User ID (for user deposit)" })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: "QR code" })
  @IsString()
  @IsOptional()
  qrCode?: string;

  @ApiPropertyOptional({ description: "Batch number" })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ description: "Is orphan packet" })
  @Transform(({ value }) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isOrphan?: boolean;
}
