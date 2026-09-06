import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * One instrument in the market ticker.
 *
 * Prices are in the quote symbol's own units — rial for the rial-quoted
 * instruments, which is every one of them today. `quoteSlug` names that unit
 * so a client formats by it rather than assuming; the panels divide by ten and
 * label it toman, and the API never converts.
 */
export class MarketTickerItemDto {
  @ApiProperty({ format: "uuid", description: "The symbol this instrument is" })
  symbolId: string;

  @ApiProperty({ example: "USD", description: "Symbol slug — the stable identifier" })
  slug: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "usdToman",
    description:
      "The camelCase key the panels' own constants file used, where one exists. " +
      "Lets a panel key its ticker off the API instead of a hardcoded list.",
  })
  tickerKey?: string | null;

  @ApiProperty({ example: "دلار آمریکا", description: "Display name, from the symbol" })
  label: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "ارز",
    description: "Grouping for the price screen: طلا / سکه / نقره / ارز / کریپتو / کالا",
  })
  category?: string | null;

  @ApiProperty({ example: 0, description: "Ascending; ties fall back to slug" })
  displayOrder: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 8925000,
    description: "What the desk buys at, in the quote symbol's units. Null when no live quote.",
  })
  buyPrice?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 8935000,
    description: "What the desk sells at. The reference ticker renders this one.",
  })
  sellPrice?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Per-gram prices, for instruments quoted by weight. Null for currencies.",
  })
  buyGramPrice?: number | null;

  @ApiPropertyOptional({ nullable: true })
  sellGramPrice?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "IRR",
    description: "The symbol the prices are denominated in. Null when the pair is not configured.",
  })
  quoteSlug?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "2026-09-05T09:12:00.000Z",
    description: "When this quote was last refreshed. Null when there is no quote at all.",
  })
  lastUpdated?: string | null;

  @ApiProperty({
    example: false,
    description:
      "The quote is older than the freshness window, or missing entirely. A ticker that " +
      "silently freezes looks identical to a live one, so this says which it is.",
  })
  stale: boolean;
}

/** The ticker as a whole. */
export class MarketTickerDto {
  @ApiProperty({ type: [MarketTickerItemDto], description: "In display order" })
  items: MarketTickerItemDto[];

  @ApiProperty({ example: "2026-09-05T09:12:03.000Z", description: "When this response was built" })
  generatedAt: string;

  @ApiProperty({
    example: 15,
    description: "Seconds after which a quote counts as stale, so a client can show its own warning",
  })
  freshnessWindowSeconds: number;
}
