import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, Min } from "class-validator";

export class UpdateP2pSettingsDto {
  @IsOptional() @IsInt() @Min(1) @ApiProperty({ required: false })
  settlementTimeoutMinutes?: number;

  @IsOptional() @IsInt() @Min(1) @ApiProperty({ required: false })
  withdrawerResponseTimeoutMinutes?: number;

  @IsOptional() @IsInt() @Min(1) @ApiProperty({ required: false })
  reservationTtlMinutes?: number;

  @IsOptional() @IsInt() @Min(1) @ApiProperty({ required: false })
  requestExpiryHours?: number;

  @IsOptional() @IsObject() @ApiProperty({ required: false })
  sourcePriority?: { deposit: any; withdrawal: any };

  @IsOptional() @IsObject() @ApiProperty({ required: false })
  matchingWeights?: Record<string, number>;

  @IsOptional() @IsInt() @Min(0) @ApiProperty({ required: false })
  matchingMaxRetry?: number;

  @IsOptional() @IsObject() @ApiProperty({ required: false })
  escalation?: Record<string, boolean>;

  @IsOptional() @IsNumber() @Min(0) @ApiProperty({ required: false })
  twoPersonApprovalThreshold?: number;

  @IsOptional() @IsBoolean() @ApiProperty({ required: false })
  allowOverUnderSplit?: boolean;
}
