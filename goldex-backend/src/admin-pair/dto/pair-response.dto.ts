import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SymbolRefDto } from "../../shared/dto/symbol-ref.dto";
import { RoutingModeEnum } from "../../pricing-route/enum/routing-mode.enum";
import { RouteKind, RouteRejection } from "../../pricing-route/price-route.types";
import { OrderSideEnum } from "../../order/enum/order.side.enum";

/**
 * A trading pair, base/quote.
 *
 * Prices are decimal strings **in the quote symbol's units**, so a
 * `XAU/IRR` price is rial per unit of gold. Commissions are percentages
 * (`decimal(10,2)`), and `minBuy`/`maxBuy`/`minSell`/`maxSell` are quantities
 * in the **base** symbol — mixing those up is the easy mistake here.
 */
export class PricePairDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  baseId: string;

  @ApiProperty({ format: "uuid" })
  quoteId: string;

  @ApiPropertyOptional({ type: SymbolRefDto, description: "Joined when the query includes it" })
  baseSymbol?: SymbolRefDto;

  @ApiPropertyOptional({ type: SymbolRefDto })
  quoteSymbol?: SymbolRefDto;

  @ApiPropertyOptional({ nullable: true, example: "74626865.67000000", description: "Quote units per base unit" })
  price?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "When `price` was last refreshed from a provider" })
  lastUpdated?: Date | null;

  @ApiPropertyOptional({ nullable: true, description: "Best provider buy price, quote units" })
  bestBuyPrice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  bestSellPrice?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Per-gram equivalents, for material pairs" })
  bestBuyGramPrice?: string | null;

  @ApiPropertyOptional({ nullable: true })
  bestSellGramPrice?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "talaab", description: "Which provider set `bestBuyPrice`" })
  bestBuyProvider?: string | null;

  @ApiPropertyOptional({ nullable: true })
  bestSellProvider?: string | null;

  @ApiProperty({ example: true, description: "False takes the pair out of trading without deleting it" })
  isValid: boolean;

  @ApiProperty({ example: "0.50", description: "Percentage, not an amount" })
  buyCommission: string;

  @ApiProperty({ example: "0.50", description: "Percentage, not an amount" })
  sellCommission: string;

  @ApiPropertyOptional({ nullable: true, example: "XAUUSD" })
  tradingViewSymbol?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "0.00100000", description: "Quantity in the base symbol" })
  minBuy?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "10.00000000", description: "Quantity in the base symbol" })
  maxBuy?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Quantity in the base symbol" })
  minSell?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Quantity in the base symbol" })
  maxSell?: string | null;

  @ApiProperty({ example: 2, description: "Display precision for prices on this pair" })
  decimals: number;

  @ApiPropertyOptional({ nullable: true, description: "Hours before a buy position warns" })
  buyWarnHours?: number | null;

  @ApiPropertyOptional({ nullable: true })
  buyExpireHours?: number | null;

  @ApiPropertyOptional({ nullable: true })
  buyGraceHours?: number | null;

  @ApiPropertyOptional({ nullable: true })
  sellWarnHours?: number | null;

  @ApiPropertyOptional({ nullable: true })
  sellExpireHours?: number | null;

  @ApiPropertyOptional({ nullable: true })
  sellGraceHours?: number | null;

  @ApiPropertyOptional({
    type: [Number],
    nullable: true,
    example: [5, 6],
    description: "Weekdays the pair does not trade, 0 = Sunday",
  })
  excludedDays?: number[] | null;

  @ApiProperty({
    enum: RoutingModeEnum,
    example: RoutingModeEnum.AUTO,
    description: "Whether the pair may be priced directly, through a bridge, or either",
  })
  routingMode: RoutingModeEnum;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Pinned bridge symbol, when one is configured" })
  bridgeSymbolId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "2.00",
    description: "How far a bridged price may differ from the direct one before it is rejected, in percent",
  })
  bridgeMaxDeviationPercent?: string | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/** One hop of a route, always expressed base → quote. */
export class RouteLegDto {
  @ApiProperty({ format: "uuid" })
  pairId: string;

  @ApiProperty({ example: "XAU" })
  baseSlug: string;

  @ApiProperty({ example: "IRR" })
  quoteSlug: string;

  @ApiProperty({
    example: false,
    description: "True when the stored pair is quote/base and its price was inverted for this leg",
  })
  inverted: boolean;

  @ApiProperty({ example: 74626865.67, description: "Price for this side, after any inversion" })
  price: number;

  @ApiPropertyOptional({ nullable: true, example: "talaab" })
  provider?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastUpdated?: string | null;

  @ApiProperty({ example: false, description: "True when the price is older than the freshness window" })
  stale: boolean;
}

export class RouteCandidateDto {
  @ApiProperty({ enum: RouteKind, example: RouteKind.DIRECT })
  kind: RouteKind;

  @ApiProperty({ enum: [OrderSideEnum.BUY, OrderSideEnum.SELL] })
  side: OrderSideEnum;

  @ApiPropertyOptional({ nullable: true, description: "Bridge symbol slug, for a bridged route" })
  bridgeSlug?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  bridgeSymbolId?: string | null;

  @ApiProperty({ type: [RouteLegDto] })
  legs: RouteLegDto[];

  @ApiPropertyOptional({
    nullable: true,
    example: 74626865.67,
    description: "Composed price in the pair's native units; null when the route is unusable",
  })
  price?: number | null;

  @ApiProperty({ example: true })
  usable: boolean;

  @ApiPropertyOptional({ enum: RouteRejection, nullable: true, description: "Why it cannot be used" })
  rejection?: RouteRejection | null;

  @ApiPropertyOptional({ nullable: true, description: "Human-readable explanation; always set when `usable` is false" })
  note?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Signed difference from the direct price, in percent, when both exist",
  })
  deviationPercent?: number | null;
}

export class PriceRouteDto {
  @ApiProperty({ format: "uuid" })
  pairId: string;

  @ApiProperty({ example: "XAU/IRR" })
  pairLabel: string;

  @ApiProperty({ enum: [OrderSideEnum.BUY, OrderSideEnum.SELL] })
  side: OrderSideEnum;

  @ApiProperty({ enum: RoutingModeEnum })
  routingMode: RoutingModeEnum;

  @ApiPropertyOptional({
    type: RouteCandidateDto,
    nullable: true,
    description: "The route actually chosen, or null when nothing is usable",
  })
  selected?: RouteCandidateDto | null;

  @ApiPropertyOptional({ type: RouteCandidateDto, nullable: true })
  direct?: RouteCandidateDto | null;

  @ApiProperty({ type: [RouteCandidateDto] })
  bridges: RouteCandidateDto[];

  @ApiProperty({
    example: false,
    description: "True when a usable bridge was rejected for exceeding the deviation limit",
  })
  deviationBlocked: boolean;
}

/** Both sides of one pair, which is what pricing callers need. */
export class PairRoutesDto {
  @ApiProperty({ format: "uuid" })
  pairId: string;

  @ApiProperty({ example: "XAU/IRR" })
  pairLabel: string;

  @ApiProperty({ enum: RoutingModeEnum })
  routingMode: RoutingModeEnum;

  @ApiPropertyOptional({ nullable: true, example: "USD" })
  configuredBridgeSlug?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 2 })
  bridgeMaxDeviationPercent?: number | null;

  @ApiProperty({ type: PriceRouteDto })
  buy: PriceRouteDto;

  @ApiProperty({ type: PriceRouteDto })
  sell: PriceRouteDto;

  @ApiProperty({ example: false, description: "True when either side is priced through a bridge" })
  usesBridge: boolean;

  @ApiProperty({
    example: false,
    description: "True when neither side has a usable route — the pair cannot be quoted",
  })
  unpriceable: boolean;
}

export class PairRequestsSummaryDto {
  @ApiProperty({ example: 12 })
  buy: number;

  @ApiProperty({ example: 8 })
  sell: number;

  @ApiProperty({
    example: { PENDING: 4, COMPLETED: 16 },
    additionalProperties: { type: "number" },
    description: "Counts keyed by state",
  })
  byState: Record<string, number>;
}

/**
 * Credit-linked activity on one pair.
 *
 * Both lists are capped at the 100 most recent, so `summary` is the reliable
 * count — do not derive totals from the array lengths.
 */
export class PairRequestsOverviewDto {
  @ApiProperty({ type: [Object], description: "Credit-linked orders, newest first, capped at 100" })
  orders: Record<string, unknown>[];

  @ApiProperty({ type: [Object], description: "Credit-linked quote requests, newest first, capped at 100" })
  quoteRequests: Record<string, unknown>[];

  @ApiProperty({ type: PairRequestsSummaryDto })
  summary: PairRequestsSummaryDto;
}
