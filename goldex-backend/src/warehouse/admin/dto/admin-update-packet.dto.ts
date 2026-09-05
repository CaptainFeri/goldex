import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsEnum, IsUUID, IsOptional, Min, IsBoolean } from "class-validator";
import { PacketStatusEnum } from "../../enum/packet-status.enum";

export class AdminUpdatePacketDto {
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  pureWeight?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idSecure?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  warehouseIndexPosition?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  picture?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  qrCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiPropertyOptional({ enum: PacketStatusEnum })
  @IsEnum(PacketStatusEnum)
  @IsOptional()
  status?: PacketStatusEnum;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isOrphan?: boolean;
}
