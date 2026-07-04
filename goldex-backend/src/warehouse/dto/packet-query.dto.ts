import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsEnum, IsString, IsUUID } from "class-validator";
import { PacketStatusEnum } from "../enum/packet-status.enum";

export class PacketQueryDto {
  @ApiPropertyOptional({ enum: PacketStatusEnum })
  @IsEnum(PacketStatusEnum)
  @IsOptional()
  status?: PacketStatusEnum;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  offset?: string;
}
