import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { CreditEnforceModeEnum } from "../../credit/enum/credit-enforce-mode.enum";

export class CreateLevelDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  @ApiProperty()
  slug: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiProperty({ required: false, default: 0 })
  priority?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, default: false })
  isDefault?: boolean;

  @IsOptional()
  @ApiProperty({ required: false, default: {} })
  features?: Record<string, any>;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, type: String })
  pairIds?: string[];

  // ── Credit v2 config ──────────────────────────────────────────────
  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, type: String })
  creditBaseSymbolId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditMaxLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditDrawdownPercent?: number;

  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiProperty({ required: false, enum: CreditEnforceModeEnum })
  creditEnforceOnDrawdown?: CreditEnforceModeEnum;

  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiProperty({ required: false, enum: CreditEnforceModeEnum })
  creditEnforceOnExpiry?: CreditEnforceModeEnum;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false })
  creditEnforceRequestDeadline?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditMaxParallelRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditMaxExecutionLevel?: number;
}
