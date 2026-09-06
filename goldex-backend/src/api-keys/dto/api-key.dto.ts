import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Min } from "class-validator";
import { ApiKeyStatus } from "../entity/api-key.entity";

export class ApiKeyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: "gx_live_••••8f3a" }) maskedKey: string;
  @ApiProperty({ enum: ApiKeyStatus }) status: ApiKeyStatus;
  @ApiProperty({ nullable: true }) monthlyQuota: number | null;
  @ApiProperty({ description: "Requests in the current calendar month." }) monthlyRequests: number;
  @ApiProperty({ nullable: true }) lastUsedAt: Date | null;
  @ApiProperty({ nullable: true }) createAt: Date | null;
}

export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty({
    description:
      "The plaintext key. Returned by this one response and never again — only its hash is stored.",
  })
  plaintextKey: string;
}

export class CreateApiKeyDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiPropertyOptional({ description: "Required if the key is later set to `limited`." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  monthlyQuota?: number;
}

export class UpdateApiKeyStatusDto {
  @ApiProperty({ enum: [ApiKeyStatus.ACTIVE, ApiKeyStatus.LIMITED, ApiKeyStatus.REVOKED] })
  @IsEnum(ApiKeyStatus)
  status: ApiKeyStatus;

  @ApiPropertyOptional({ description: "Required when moving to `limited`; a cap is what `limited` means." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  monthlyQuota?: number;
}

export class ApiStatsDto {
  @ApiProperty() requestsToday: number;
  @ApiProperty({ nullable: true, description: "Null when there was no traffic to average." })
  avgResponseMs: number | null;
  @ApiProperty({ nullable: true }) successPercent: number | null;
  @ApiProperty({ nullable: true }) errorPercent: number | null;
  @ApiProperty({ description: "Active, non-revoked keys." }) activeKeys: number;
  @ApiProperty({
    description:
      "How many routes currently accept API-key authentication. Zero means the figures above " +
      "are genuinely zero rather than broken — no endpoint accepts a key yet.",
  })
  keyedRouteCount: number;
}

export class TrafficPointDto {
  @ApiProperty({ description: "Start of the bucket, UTC." }) bucket: Date;
  @ApiProperty() requests: number;
  @ApiProperty() errors: number;
}

export class TrafficDto {
  @ApiProperty({ type: TrafficPointDto, isArray: true }) points: TrafficPointDto[];
  @ApiProperty() keyedRouteCount: number;
}

export const TRAFFIC_WINDOWS = ["24h", "7d"] as const;

export class TrafficQueryDto {
  @ApiPropertyOptional({ enum: TRAFFIC_WINDOWS, default: "24h" })
  @IsOptional()
  @IsIn(TRAFFIC_WINDOWS as unknown as string[])
  window?: string;
}
