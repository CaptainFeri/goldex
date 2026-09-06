import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** Bounds on the client refresh cadence. */
export const REFRESH_INTERVAL_MIN_SEC = 1;
export const REFRESH_INTERVAL_MAX_SEC = 300;

/**
 * One price source.
 *
 * These are `provider` rows, not a list this module keeps. The pricing engine
 * owns providers; this backend mirrors them and toggles one by publishing a
 * command — so `active` here is the same flag the providers screen shows, and
 * turning a source off on this screen turns it off on that one.
 */
export class PriceEngineSourceDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "tgju" })
  key: string;

  @ApiPropertyOptional({ nullable: true, example: "تی‌جی‌جی‌یو", description: "Persian name, where the provider has one" })
  label?: string | null;

  @ApiProperty({ example: "gold" })
  category: string;

  @ApiProperty({ example: true, description: "Whether the engine is asked to poll this source" })
  active: boolean;

  @ApiProperty({
    example: "connected",
    description: "Runtime state last reported by the engine: connected / connecting / disconnected / stopped / inactive / error",
  })
  status: string;

  @ApiPropertyOptional({ nullable: true, example: "2026-09-06T09:00:00.000Z" })
  lastStatusChangeAt?: string | null;
}

/** Why `autoSpread` is what it is, and where to change it. */
export class AutoSpreadDto {
  @ApiProperty({
    example: true,
    description:
      "Whether an automatic spread is in effect anywhere — true when at least one valid pair " +
      "carries a commission or at least one symbol carries a gain.",
  })
  enabled: boolean;

  @ApiProperty({ example: 4, description: "Valid pairs with a non-zero buy or sell commission" })
  pairsWithCommission: number;

  @ApiProperty({ example: 2, description: "Symbols with a non-zero gain" })
  symbolsWithGain: number;

  @ApiProperty({
    example: false,
    description:
      "Always false. The spread is the desk's margin on every quote and is configured per pair " +
      "(`buyCommission` / `sellCommission`) and per symbol (`gain`); a single global switch " +
      "would zero that margin platform-wide in one click, and there is no code path that " +
      "restores it. Change it where it is configured.",
  })
  writable: boolean;
}

export class PriceEngineConfigDto {
  @ApiProperty({ type: [PriceEngineSourceDto], description: "Every registered provider, by key" })
  sources: PriceEngineSourceDto[];

  @ApiProperty({ type: AutoSpreadDto })
  autoSpread: AutoSpreadDto;

  @ApiProperty({
    example: 3,
    description:
      "How often a client should refresh prices, in seconds. The **client** cadence — the " +
      "engine's own fetch interval is per provider and is not set from here.",
  })
  refreshIntervalSec: number;

  @ApiPropertyOptional({ nullable: true, example: "2026-09-06T09:00:00.000Z" })
  updateAt?: string | null;
}

/** Turn one source on or off. */
export class UpdateEngineSourceDto {
  @ApiProperty({ example: "tgju", description: "Provider key, as returned by `GET /admin/price/engine-config`" })
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  active: boolean;
}

export class UpdateEngineConfigDto {
  @ApiPropertyOptional({
    type: [UpdateEngineSourceDto],
    description:
      "Only the sources named are touched; one already in the requested state is left alone " +
      "rather than re-commanded, so replaying the whole config is safe.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateEngineSourceDto)
  sources?: UpdateEngineSourceDto[];

  @ApiPropertyOptional({
    description:
      "Accepted only when it matches the current derived value, so a client can send the whole " +
      "config object back unchanged. Any other value is a 400 — see `autoSpread.writable`.",
  })
  @IsOptional()
  @IsBoolean()
  autoSpread?: boolean;

  @ApiPropertyOptional({ minimum: REFRESH_INTERVAL_MIN_SEC, maximum: REFRESH_INTERVAL_MAX_SEC })
  @IsOptional()
  @IsInt()
  @Min(REFRESH_INTERVAL_MIN_SEC)
  @Max(REFRESH_INTERVAL_MAX_SEC)
  refreshIntervalSec?: number;
}
