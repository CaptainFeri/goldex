import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * One tradable instrument on the price screen.
 *
 * Prices are in the quote symbol's own units — rial, named by `quoteSlug` on
 * the envelope. The panels divide by ten and label it toman; the API never
 * converts. See `docs/PARSZARGAR-ADMIN-API-PLAN.md` §3.1.
 */
export class PriceInstrumentDto {
  @ApiProperty({ format: "uuid", description: "Symbol id — what the market-status route takes" })
  id: string;

  @ApiProperty({ example: "XAU", description: "Symbol slug — what `GET /price/history?symbols=` takes" })
  slug: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "usdToman",
    description: "The camelCase key the panels' own constants file used, where one exists",
  })
  tickerKey?: string | null;

  @ApiProperty({ example: "دلار آمریکا" })
  name: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "ارز",
    description: "Grouping: طلا / سکه / نقره / ارز / کریپتو / کالا. Null groups under سایر.",
  })
  category?: string | null;

  @ApiProperty({
    example: "#d4af37",
    description:
      "Chart stroke. The desk's configured colour when it set one, otherwise a hue derived " +
      "from the slug — deterministic, so a series keeps its colour between polls.",
  })
  color: string;

  @ApiProperty({
    example: false,
    description: "False when `color` was derived rather than configured on the symbol",
  })
  colorConfigured: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: 8925000,
    description: "What the desk buys at, in the quote symbol's units. Null when there is no live quote.",
  })
  buy?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 8935000, description: "What the desk sells at" })
  sell?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Per-gram, for instruments quoted by weight" })
  buyGram?: number | null;

  @ApiPropertyOptional({ nullable: true })
  sellGram?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "IRR",
    description: "The symbol the prices are denominated in. Null when this instrument has no pair.",
  })
  quoteSlug?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: "uuid",
    description: "The pair carrying the price. Null when none is configured — the prices are then null too.",
  })
  pairId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: true,
    description:
      "Whether the MARKET pool of this instrument's pair is open. Null when the pair has never " +
      "been reconciled (or does not exist) — which is not the same as closed, so it is not " +
      "reported as closed.",
  })
  marketOpen?: boolean | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "price-fresh",
    description: "Why the pool is in that state: price-fresh / stale-price / no-price / bridge-price / admin-override",
  })
  marketStatusReason?: string | null;

  @ApiProperty({
    example: false,
    description: "An admin has forced this instrument's market open or closed, overriding derivation",
  })
  marketOverridden: boolean;

  @ApiPropertyOptional({ nullable: true, example: "2026-09-06T09:12:00.000Z" })
  lastUpdated?: string | null;

  @ApiProperty({
    example: false,
    description: "The quote is older than the freshness window, or missing entirely",
  })
  stale: boolean;
}

/** Instruments of one category, in display order. */
export class PriceInstrumentGroupDto {
  @ApiProperty({ example: "ارز", description: "`سایر` collects instruments with no category set" })
  category: string;

  @ApiProperty({ type: [PriceInstrumentDto] })
  items: PriceInstrumentDto[];
}

export class PriceInstrumentsDto {
  @ApiProperty({
    type: [PriceInstrumentGroupDto],
    description: "Categories in first-appearance order of their instruments, so display order drives both levels",
  })
  groups: PriceInstrumentGroupDto[];

  @ApiProperty({ example: 12, description: "Instruments across every group" })
  total: number;

  @ApiProperty({ example: "IRR", description: "The symbol every price here is quoted in" })
  quoteSlug: string;

  @ApiProperty({ example: "2026-09-06T09:12:03.000Z" })
  generatedAt: string;

  @ApiProperty({ example: 15, description: "Seconds after which a quote counts as stale" })
  freshnessWindowSeconds: number;
}

/** Optional narrowing for the instrument list. */
export class PriceInstrumentQueryDto {
  @ApiPropertyOptional({ description: "Exact category match, e.g. `ارز`" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional({ description: "Case-insensitive contains, over name, slug and ticker key" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

/**
 * Open or close an instrument's market.
 *
 * `open` is the admin override, applied to **every** pool of the instrument's
 * pair — the "close this instrument" action. Omitting it (or sending null)
 * clears the override and hands the pools back to automatic derivation, which
 * is the only way to return to it once one has been set.
 */
export class SetInstrumentMarketStatusDto {
  @ApiPropertyOptional({
    nullable: true,
    example: true,
    description: "true forces open, false forces closed, null clears the override",
  })
  @IsOptional()
  @IsBoolean()
  open?: boolean | null;
}
