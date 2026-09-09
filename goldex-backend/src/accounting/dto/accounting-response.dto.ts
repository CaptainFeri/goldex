import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ValuationBasisEnum } from "../enum/valuation-basis.enum";

/** A symbol as named on an accounting response. */
export class AccountingSymbolRefDto {
  @ApiPropertyOptional({ format: "uuid", nullable: true })
  id?: string | null;

  @ApiPropertyOptional({ nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "XAU" })
  slug?: string | null;
}

/**
 * The pricing symbol every figure on the page is converted into. `isDefault`
 * marks the Rial fallback used before an admin has chosen one.
 */
export class AccountingReferenceDto {
  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "IRR" })
  slug: string;

  @ApiPropertyOptional({ description: "True when this is the fallback, not an explicit choice" })
  isDefault?: boolean;
}

/** The accounting policy: what the books are reported in and how assets are valued. */
export class AccountingSettingsDto {
  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    description: "Null until an admin picks one; the Rial symbol is used meanwhile",
  })
  referenceSymbolId?: string | null;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ description: "A quote older than this is still used, but reported as stale" })
  priceStalenessSeconds: number;

  @ApiPropertyOptional({
    type: AccountingReferenceDto,
    description: "The symbol actually in effect (present on reads, not on the update response)",
  })
  effectiveReference?: AccountingReferenceDto;
}

/** One hop of a conversion path between two symbols. */
export class ValuationLegDto {
  @ApiProperty({ format: "uuid" })
  pairId: string;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;

  @ApiProperty({ description: "True when the stored pair reads to/from and its price was inverted" })
  inverted: boolean;

  @ApiProperty({ description: "`to` units per one `from` unit, after any inversion" })
  rate: number;

  @ApiPropertyOptional({ nullable: true, format: "date-time" })
  lastUpdated?: string | null;

  @ApiProperty()
  stale: boolean;
}

/** A conversion rate from one symbol into the reference, with its path. */
export class ValuationRateDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  from: AccountingSymbolRefDto;

  @ApiProperty({ type: AccountingSymbolRefDto })
  to: AccountingSymbolRefDto;

  @ApiPropertyOptional({
    nullable: true,
    description: "`to` units per one `from` unit, or null when no priced path exists",
  })
  rate?: number | null;

  @ApiProperty({ type: [ValuationLegDto] })
  legs: ValuationLegDto[];

  @ApiProperty({ description: "True when any leg's quote is older than the staleness window" })
  stale: boolean;

  @ApiPropertyOptional({ description: "Set when rate is null, saying why nothing could be priced" })
  reason?: string;
}

/** Profit and cost for one asset, in its own unit and in the reference. */
export class AccountingProfitAssetDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiProperty()
  revenue: number;

  @ApiProperty()
  cost: number;

  @ApiProperty({ description: "revenue − cost" })
  net: number;

  @ApiPropertyOptional({ nullable: true })
  rate?: number | null;

  @ApiProperty()
  rateStale: boolean;

  @ApiProperty({ type: [ValuationLegDto] })
  rateLegs: ValuationLegDto[];

  @ApiPropertyOptional({ nullable: true })
  revenueInReference?: number | null;

  @ApiPropertyOptional({ nullable: true })
  costInReference?: number | null;

  @ApiPropertyOptional({ nullable: true })
  netInReference?: number | null;

  @ApiPropertyOptional({ description: "Why this asset could not be priced" })
  unpricedReason?: string;
}

/** Totals in the reference symbol. */
export class AccountingProfitTotalsDto {
  @ApiProperty()
  revenue: number;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  net: number;
}

/** An asset left out of the totals because nothing could price it. */
export class AccountingUnpricedAssetDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;
}

/** The window a summary covers. */
export class AccountingRangeDto {
  @ApiProperty({ format: "date-time" })
  from: string;

  @ApiProperty({ format: "date-time" })
  to: string;
}

/** Profit, cost and net per asset, valued at live prices in the reference symbol. */
export class AccountingProfitSummaryDto {
  @ApiProperty({ type: AccountingRangeDto })
  range: AccountingRangeDto;

  @ApiProperty({ type: AccountingReferenceDto })
  reference: AccountingReferenceDto;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty()
  priceStalenessSeconds: number;

  @ApiProperty({ type: [AccountingProfitAssetDto] })
  assets: AccountingProfitAssetDto[];

  @ApiProperty({ type: AccountingProfitTotalsDto })
  totals: AccountingProfitTotalsDto;

  @ApiProperty({
    type: [AccountingUnpricedAssetDto],
    description: "A non-empty list means the totals understate the books",
  })
  unpricedAssets: AccountingUnpricedAssetDto[];

  @ApiProperty({ description: "True when any priced leg is older than the staleness window" })
  stale: boolean;

  @ApiProperty({ format: "date-time" })
  asOf: string;
}

/** Customer and system balances for one asset. */
export class AccountingHoldingDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiProperty({ description: "Free, locked and frozen customer balances added together" })
  customerTotal: number;

  @ApiProperty()
  systemBalance: number;

  @ApiPropertyOptional({ nullable: true })
  rate?: number | null;

  @ApiProperty()
  rateStale: boolean;

  @ApiPropertyOptional({ nullable: true })
  customerTotalInReference?: number | null;

  @ApiPropertyOptional({ nullable: true })
  systemBalanceInReference?: number | null;
}

/** Holdings totals in the reference symbol. */
export class AccountingHoldingTotalsDto {
  @ApiProperty()
  customer: number;

  @ApiProperty()
  system: number;
}

/** Customer and system balances valued in the reference symbol. */
export class AccountingHoldingsDto {
  @ApiProperty({ type: AccountingReferenceDto })
  reference: AccountingReferenceDto;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ type: [AccountingHoldingDto] })
  assets: AccountingHoldingDto[];

  @ApiProperty({ type: AccountingHoldingTotalsDto })
  totals: AccountingHoldingTotalsDto;

  @ApiProperty({ format: "date-time" })
  asOf: string;
}

/** Live conversion rate from each active symbol into the reference. */
export class AccountingRatesDto {
  @ApiProperty({ type: AccountingReferenceDto })
  reference: AccountingReferenceDto;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ type: [ValuationRateDto] })
  rates: ValuationRateDto[];

  @ApiProperty({ format: "date-time" })
  asOf: string;
}
