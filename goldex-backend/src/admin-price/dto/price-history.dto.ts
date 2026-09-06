import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/** Default and bounds for the chart window. */
export const HISTORY_DEFAULT_POINTS = 30;
export const HISTORY_MAX_POINTS = 500;
export const HISTORY_DEFAULT_HOURS = 24;
export const HISTORY_MAX_HOURS = 24 * 30;
/** More series than this and the chart is unreadable anyway; the query is the cost. */
export const HISTORY_MAX_SYMBOLS = 25;

export class PriceHistoryQueryDto {
  @ApiProperty({
    example: "XAU,USD,EUR",
    description:
      "Comma-separated **symbol slugs**, as returned by `GET /admin/price/instruments`. " +
      `At most ${HISTORY_MAX_SYMBOLS}.`,
  })
  @IsString()
  @MaxLength(1000)
  symbols: string;

  @ApiPropertyOptional({
    default: HISTORY_DEFAULT_POINTS,
    description: "Number of equal-width buckets across the window",
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(2)
  @Max(HISTORY_MAX_POINTS)
  points?: number;

  @ApiPropertyOptional({
    default: HISTORY_DEFAULT_HOURS,
    description: "How far back the window reaches, in hours",
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(HISTORY_MAX_HOURS)
  hours?: number;

  @ApiPropertyOptional({
    description:
      "Restrict to one provider's reported prices. Left off, each bucket carries the most " +
      "recent price from whichever provider reported last — which is what the pair's own best " +
      "price follows.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  providerKey?: string;
}

/** What a client needs to draw one instrument's two lines. */
export class PriceHistorySeriesDto {
  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty({ example: "XAU" })
  slug: string;

  @ApiProperty({ example: "طلا" })
  name: string;

  @ApiProperty({ example: "#d4af37" })
  color: string;

  @ApiProperty({ example: "XAU_buy", description: "Key of the buy value on every row" })
  buyKey: string;

  @ApiProperty({ example: "XAU_sell" })
  sellKey: string;

  @ApiProperty({
    example: 30,
    description: "Buckets that end up with a value once gaps are carried forward. Zero means no recorded price in or before the window.",
  })
  filledPoints: number;
}

/** A slug that was asked for but could not be charted, and why. */
export class PriceHistoryMissingDto {
  @ApiProperty({ example: "BTC" })
  slug: string;

  @ApiProperty({
    example: "no-pair",
    description: "unknown-symbol — no such slug; no-pair — the symbol has no pair against the quote symbol",
  })
  reason: string;
}

export class PriceHistoryDto {
  @ApiProperty({
    type: [PriceHistorySeriesDto],
    description: "In the order the slugs were requested, minus the ones in `missing`",
  })
  series: PriceHistorySeriesDto[];

  @ApiProperty({
    type: [PriceHistoryMissingDto],
    description: "Requested slugs that produced no series. Empty on a fully served request.",
  })
  missing: PriceHistoryMissingDto[];

  @ApiProperty({
    type: "array",
    items: { type: "object", additionalProperties: true },
    description:
      "One object per bucket, oldest first: `{ i, at, \"<slug>_buy\": number|null, \"<slug>_sell\": number|null }`. " +
      "A bucket with no price of its own carries the last one before it; buckets before an " +
      "instrument's first recorded price are null rather than zero, so a gap reads as a gap.",
    example: [{ i: 0, at: "2026-09-05T09:00:00.000Z", XAU_buy: 89250000, XAU_sell: 89350000 }],
  })
  rows: Array<Record<string, number | string | null>>;

  @ApiProperty({ example: "2026-09-05T09:00:00.000Z", description: "Start of the first bucket" })
  from: string;

  @ApiProperty({ example: "2026-09-06T09:00:00.000Z", description: "End of the last bucket" })
  to: string;

  @ApiProperty({ example: 30 })
  points: number;

  @ApiProperty({ example: 2880, description: "Bucket width in seconds" })
  bucketSeconds: number;

  @ApiProperty({ example: "IRR", description: "The symbol every price here is quoted in" })
  quoteSlug: string;
}
