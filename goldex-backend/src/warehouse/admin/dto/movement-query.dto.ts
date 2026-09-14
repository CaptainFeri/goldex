import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { MovementDirectionEnum, MovementPartyEnum, MovementSourceEnum } from "../../enum/movement.enum";

export class MovementQueryDto {
  @ApiPropertyOptional({ description: "محدود به یک انبار" })
  @IsUUID()
  @IsOptional()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: MovementDirectionEnum })
  @IsEnum(MovementDirectionEnum)
  @IsOptional()
  direction?: MovementDirectionEnum;

  @ApiPropertyOptional({ enum: MovementSourceEnum, description: "چه فرایندی این حرکت را ساخته" })
  @IsEnum(MovementSourceEnum)
  @IsOptional()
  source?: MovementSourceEnum;

  @ApiPropertyOptional({ enum: MovementPartyEnum })
  @IsEnum(MovementPartyEnum)
  @IsOptional()
  partyType?: MovementPartyEnum;

  @ApiPropertyOptional({ description: "محدود به یک کاربر" })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: "محدود به یک تامین‌کننده" })
  @IsString()
  @IsOptional()
  providerKey?: string;

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
