import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { P2pSplitPolicyEnum } from "../enum/p2p.enums";

export class P2pSplitDto {
  @IsEnum(P2pSplitPolicyEnum)
  @ApiProperty({ enum: P2pSplitPolicyEnum })
  policy: P2pSplitPolicyEnum;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, description: "Required when policy = EXACT" })
  parts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, description: "Required when policy = RANGE" })
  minParts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, description: "Required when policy = RANGE or MAXIMUM" })
  maxParts?: number;
}

export class P2pConstraintsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false })
  minPart?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false })
  maxPart?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  preferredBank?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: "Free text — shown to admins, never matched on" })
  notes?: string;
}

export class CreateP2pWithdrawDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => P2pSplitDto)
  @ApiProperty({ required: false, type: P2pSplitDto })
  split?: P2pSplitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => P2pConstraintsDto)
  @ApiProperty({ required: false, type: P2pConstraintsDto })
  constraints?: P2pConstraintsDto;
}
