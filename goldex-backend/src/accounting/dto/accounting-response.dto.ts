import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ValuationBasisEnum } from "../enum/valuation-basis.enum";

/** A symbol as the accounting endpoints identify it. */
export class AccountingSymbolRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ nullable: true, example: "طلای ۱۸ عیار" })
  name: string | null;

  @ApiProperty({ nullable: true, example: "XAU" })
  slug: string | null;
}

/** The symbol every figure is converted into, and whether it was chosen. */
export class EffectiveReferenceDto {
  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty({ nullable: true })
  name: string | null;

  @ApiProperty({ nullable: true, example: "IRR" })
  slug: string | null;

  @ApiProperty({
    description: "True when no reference was chosen and the Rial fallback is in use",
  })
  isDefault: boolean;
}

export class AccountingSettingsDto {
  @ApiProperty({
    format: "uuid",
    nullable: true,
    description: "The pricing symbol an admin chose, or null while unset",
  })
  referenceSymbolId: string | null;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ example: 120, description: "A quote older than this is reported as stale" })
  priceStalenessSeconds: number;

  @ApiPropertyOptional({ type: EffectiveReferenceDto })
  effectiveReference?: EffectiveReferenceDto;
}

/** One hop of a conversion into the reference symbol. */
export class ValuationLegDto {
  @ApiProperty({ format: "uuid" })
  pairId: string;

  @ApiProperty({ example: "XAU" })
  from: string;

  @ApiProperty({ example: "IRR" })
  to: string;

  @ApiProperty({ description: "True when the stored pair reads to/from and was inverted" })
  inverted: boolean;

  @ApiProperty({ description: "`to` units per one `from` unit, after any inversion" })
  rate: number;

  @ApiProperty({ nullable: true, format: "date-time" })
  lastUpdated: string | null;

  @ApiProperty()
  stale: boolean;
}

/** One asset's contribution to the books, native and converted. */
export class AccountingAssetLineDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiProperty({ description: "Credits to the system in this asset" })
  revenue: number;

  @ApiProperty({ description: "Debits against the system in this asset, as a positive number" })
  cost: number;

  @ApiProperty({ description: "revenue - cost, in this asset" })
  net: number;

  @ApiProperty({
    nullable: true,
    description: "Reference units per one unit of this asset, or null when unpriced",
  })
  rate: number | null;

  @ApiProperty()
  rateStale: boolean;

  @ApiProperty({ type: [ValuationLegDto] })
  rateLegs: ValuationLegDto[];

  @ApiProperty({ nullable: true })
  revenueInReference: number | null;

  @ApiProperty({ nullable: true })
  costInReference: number | null;

  @ApiProperty({ nullable: true })
  netInReference: number | null;

  @ApiPropertyOptional({ description: "Why this line could not be converted" })
  unpricedReason?: string;
}

export class AccountingTotalsDto {
  @ApiProperty()
  revenue: number;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  net: number;
}

export class UnpricedAssetDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiPropertyOptional()
  reason?: string;
}

export class AccountingRangeDto {
  @ApiProperty({ format: "date-time" })
  from: string;

  @ApiProperty({ format: "date-time" })
  to: string;
}

export class AccountingSummaryDto {
  @ApiProperty({ type: AccountingRangeDto })
  range: AccountingRangeDto;

  @ApiProperty({ type: EffectiveReferenceDto })
  reference: EffectiveReferenceDto;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty()
  priceStalenessSeconds: number;

  @ApiProperty({ type: [AccountingAssetLineDto] })
  assets: AccountingAssetLineDto[];

  @ApiProperty({
    type: AccountingTotalsDto,
    description: "Priced assets only — see `unpricedAssets` for what is missing",
  })
  totals: AccountingTotalsDto;

  @ApiProperty({
    type: [UnpricedAssetDto],
    description: "Assets left out of the totals because nothing could price them",
  })
  unpricedAssets: UnpricedAssetDto[];

  @ApiProperty({ description: "True when any priced leg is older than the staleness window" })
  stale: boolean;

  @ApiProperty({ format: "date-time" })
  asOf: string;
}

export class AccountingHoldingLineDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  symbol: AccountingSymbolRefDto;

  @ApiProperty()
  customerTotal: number;

  @ApiProperty()
  systemBalance: number;

  @ApiProperty({ nullable: true })
  rate: number | null;

  @ApiProperty()
  rateStale: boolean;

  @ApiProperty({ nullable: true })
  customerTotalInReference: number | null;

  @ApiProperty({ nullable: true })
  systemBalanceInReference: number | null;
}

export class AccountingHoldingTotalsDto {
  @ApiProperty()
  customer: number;

  @ApiProperty()
  system: number;
}

export class AccountingHoldingsDto {
  @ApiProperty({ type: EffectiveReferenceDto })
  reference: EffectiveReferenceDto;

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ type: [AccountingHoldingLineDto] })
  assets: AccountingHoldingLineDto[];

  @ApiProperty({ type: AccountingHoldingTotalsDto })
  totals: AccountingHoldingTotalsDto;

  @ApiProperty({ format: "date-time" })
  asOf: string;
}

export class ValuationRateDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  from: { id: string; slug: string };

  @ApiProperty({ type: AccountingSymbolRefDto })
  to: { id: string; slug: string };

  @ApiProperty({ nullable: true, description: "`to` units per one `from` unit" })
  rate: number | null;

  @ApiProperty({ type: [ValuationLegDto] })
  legs: ValuationLegDto[];

  @ApiProperty()
  stale: boolean;

  @ApiPropertyOptional({ description: "Set when `rate` is null" })
  reason?: string;
}

export class AccountingRatesDto {
  @ApiProperty({ type: AccountingSymbolRefDto })
  reference: { symbolId: string; name: string; slug: string };

  @ApiProperty({ enum: ValuationBasisEnum })
  valuationBasis: ValuationBasisEnum;

  @ApiProperty({ type: [ValuationRateDto] })
  rates: ValuationRateDto[];

  @ApiProperty({ format: "date-time" })
  asOf: string;
}
