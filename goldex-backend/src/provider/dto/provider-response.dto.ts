import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * A pricing provider, as the admin panel sees it.
 *
 * This is a **mirror**, not the source of truth: goldex-pricing-engine owns the
 * authoritative provider table and the runtime lifecycle, and this record is
 * kept in sync by RabbitMQ events published back from it. `status` in
 * particular is a reported runtime state, not something the admin API sets.
 *
 * `auth` and `config` are deliberately omitted: they carry provider
 * credentials, and this DTO is what the panel receives.
 */
export class ProviderDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "talaab", description: "Stable key the pricing engine addresses this provider by" })
  key: string;

  @ApiProperty({ example: "material", description: "rial, fiat, crypto or material" })
  category: string;

  @ApiProperty({ example: "https://provider.example" })
  baseUrl: string;

  @ApiPropertyOptional({ nullable: true, description: "Where its API lives, when that differs from `baseUrl`" })
  apiBaseUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "طلاآب" })
  persianName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Operator-facing panel, for manual checks" })
  webPanelUrl?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "The number that receives the activation OTP" })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  sendOtpUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  verifyCodeUrl?: string | null;

  @ApiProperty({ example: true, description: "Whether the engine should connect to it" })
  active: boolean;

  @ApiProperty({ example: 60000, description: "How often the engine refreshes this provider's metadata, in ms" })
  metadataRefreshIntervalMs: number;

  @ApiProperty({
    example: "connected",
    description:
      "Runtime state reported by the engine: connected, connecting, disconnected, stopped, inactive or error. Read-only here",
  })
  status: string;

  @ApiPropertyOptional({ nullable: true })
  lastStatusChangeAt?: Date | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/**
 * Acknowledgement of a command sent to the pricing engine.
 *
 * These endpoints publish a message and return immediately — a 200 means the
 * request was queued, not that the engine has finished. Poll the provider's
 * status or the relevant snapshot for the outcome.
 */
export class ProviderCommandAckDto {
  @ApiProperty({ example: "Provider talaab refresh requested", description: "English; not localised" })
  message: string;
}

/** Just enough to render a provider's connection indicator. */
export class ProviderStatusDto {
  @ApiProperty({ example: "talaab" })
  key: string;

  @ApiProperty({ example: "material" })
  category: string;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ example: "connected" })
  status: string;

  @ApiPropertyOptional({ nullable: true })
  lastStatusChangeAt?: Date | null;
}

/**
 * Trading activity with one provider, aggregated per instrument.
 *
 * Volumes are quantities in `baseSymbol`; values are money in `quoteSymbol`.
 * `net` is buy minus sell, so it is signed.
 */
export class ProviderDealSnapshotDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "talaab" })
  providerKey: string;

  @ApiPropertyOptional({ nullable: true, description: "The provider's own instrument id" })
  itemId?: number | null;

  @ApiPropertyOptional({ nullable: true, example: "XAU" })
  baseSymbol?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "IRR" })
  quoteSymbol?: string | null;

  @ApiProperty({ example: 128 })
  dealCount: number;

  @ApiProperty({ example: "12.50000000", description: "Quantity, in the base symbol" })
  totalVolume: string;

  @ApiProperty({ example: "932835820.00", description: "Money, in the quote symbol" })
  totalValue: string;

  @ApiProperty({ example: "8.00000000" })
  buyVolume: string;

  @ApiProperty({ example: "4.50000000" })
  sellVolume: string;

  @ApiProperty({ example: "3.50000000", description: "Buy minus sell; signed" })
  netVolume: string;

  @ApiProperty({ example: "597014925.00" })
  buyValue: string;

  @ApiProperty({ example: "335820895.00" })
  sellValue: string;

  @ApiProperty({ example: "261194030.00", description: "Buy minus sell; signed" })
  netValue: string;

  @ApiPropertyOptional({ nullable: true })
  lastDealAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt?: Date;
}

/** The provider's balances as last reported. */
export class ProviderBalanceSnapshotDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "talaab" })
  providerKey: string;

  @ApiPropertyOptional({ nullable: true, example: "12.50000000", description: "Grams" })
  goldBalance?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "932835820.00", description: "Rial" })
  rialBalance?: string | null;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * A live price row for one of a provider's instruments.
 *
 * Read straight from the pricing engine's Redis rather than from Postgres, so
 * it reflects the last tick received — not a stored snapshot. Prices are in the
 * instrument's own quote units.
 */
export class ProviderPriceItemDto {
  @ApiProperty({ example: 137, description: "The provider's own instrument id" })
  itemId: number;

  @ApiPropertyOptional({ example: "طلای ۱۸ عیار" })
  itemName?: string;

  @ApiPropertyOptional({ example: "gram" })
  unit?: string;

  @ApiProperty({ example: 74626865.67 })
  buyPrice: number;

  @ApiProperty({ example: 74826865.67 })
  sellPrice: number;

  @ApiProperty({ example: 200000, description: "sellPrice − buyPrice, in quote units" })
  spread: number;

  @ApiProperty({ example: 0.27 })
  spreadPercent: number;

  @ApiProperty({ example: true, description: "Whether the provider is currently accepting buys" })
  canBuy: boolean;

  @ApiProperty({ example: true })
  canSell: boolean;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z", description: "When the provider published this tick" })
  timestamp: string;

  @ApiPropertyOptional({ example: "talaab" })
  providerKey?: string;

  @ApiPropertyOptional({ description: "Per-gram equivalents, for material instruments" })
  buyPricePerGram?: number;

  @ApiPropertyOptional()
  sellPricePerGram?: number;
}
