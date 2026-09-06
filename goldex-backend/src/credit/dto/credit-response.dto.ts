import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { SymbolRefDto } from "../../shared/dto/symbol-ref.dto";
import { UserRefDto } from "../../shared/dto/user-ref.dto";

/**
 * A credit facility.
 *
 * Two different units live side by side here and mixing them is the easy
 * mistake: `collateralAmount` is a quantity in `collateralSymbol` (grams of
 * gold, say), while `creditLimit`, `usedCredit` and every `*Value` field are
 * money in `creditBaseSymbol`. Percentages (`leverage`, `drawdownPercent`,
 * `callMarginPercent`, `cashoutFeePercent`) are neither.
 *
 * `usedCredit` on the row can lag: several endpoints recompute it from
 * completed orders rather than trusting the column.
 */
export class CreditDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "CR-140504-0012", description: "Human-facing reference" })
  creditCode: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ type: UserRefDto })
  user?: UserRefDto;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin who opened the facility" })
  adminId?: string | null;

  @ApiProperty({ enum: CreditStatusEnum, example: CreditStatusEnum.ACTIVE })
  status: CreditStatusEnum;

  @ApiProperty({ example: "500000000.00000000", description: "Face amount, in the credit base symbol" })
  amount: string;

  @ApiProperty({ example: "500000000.00000000", description: "Money the user may draw, in the credit base symbol" })
  creditLimit: string;

  @ApiProperty({
    example: "120000000.00000000",
    description: "Drawn so far. Recomputed from completed orders by the risk and cash-out endpoints",
  })
  usedCredit: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  creditBaseSymbolId?: string | null;

  @ApiPropertyOptional({ type: SymbolRefDto, description: "The symbol the facility is denominated in" })
  creditBaseSymbol?: SymbolRefDto;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  collateralSymbolId?: string | null;

  @ApiPropertyOptional({ type: SymbolRefDto })
  collateralSymbol?: SymbolRefDto;

  @ApiProperty({ example: "12.50000000", description: "Quantity, in the collateral symbol — not money" })
  collateralAmount: string;

  @ApiPropertyOptional({ nullable: true, description: "Collateral valued at open, in the credit base symbol" })
  initialCollateralValue?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Collateral valued now, in the credit base symbol" })
  currentCollateralValue?: string | null;

  @ApiProperty({ example: "2.00", description: "Ratio, not a percentage" })
  leverage: string;

  @ApiPropertyOptional({ nullable: true, example: "8.50", description: "Percent below the opening valuation" })
  drawdownPercent?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastDrawdownPercent?: string | null;

  @ApiProperty({ example: false })
  hasCallMargin: boolean;

  @ApiPropertyOptional({ nullable: true, example: "80.00", description: "Percent at which a margin call fires" })
  callMarginPercent?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Outstanding shortfall, in the credit base symbol" })
  outstandingShortfall?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "0.50", description: "Cash-out fee rate, percent" })
  cashoutFeePercent?: string | null;

  @ApiPropertyOptional({ description: "Risk bucket: OK, WARNING, MARGIN_CALL or DEFAULT" })
  riskState?: string;

  @ApiPropertyOptional({ description: "Where the facility sits in the settlement flow" })
  settlementState?: string;

  @ApiPropertyOptional({ example: false })
  isInDefault?: boolean;

  @ApiPropertyOptional({ nullable: true })
  expireAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  activatedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  settledAt?: Date | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  settledByAdminId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Proof image for a manual settlement" })
  settleImagePath?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/** One per-trade collateral lock. */
export class CollateralLockDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  creditId: string;

  @ApiProperty({ example: "1.50000000", description: "Quantity, in the collateral symbol" })
  amount: string;

  @ApiPropertyOptional({ nullable: true, description: "Value at lock time, in the credit base symbol" })
  notionalValue?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Mark price used when the lock was taken" })
  priceAtLock?: string | null;

  @ApiPropertyOptional({ description: "ACTIVE, RELEASED or CONSUMED" })
  status?: string;

  @ApiProperty()
  createAt: Date;
}

export class CollateralLockSummaryDto {
  @ApiProperty({ example: 4.5, description: "Currently locked, in collateral units" })
  totalLocked: number;

  @ApiProperty({ example: 8, description: "Collateral free to lock" })
  available: number;

  @ApiProperty({ example: 3, description: "Count of active locks" })
  active: number;

  @ApiProperty({ example: 1.5, description: "Released back, in collateral units" })
  released: number;

  @ApiProperty({ example: 0.5, description: "Consumed by settlement, in collateral units" })
  consumed: number;
}

export class CreditCollateralLocksDto {
  @ApiProperty({ type: CollateralLockSummaryDto })
  summary: CollateralLockSummaryDto;

  @ApiProperty({ type: [CollateralLockDto] })
  locks: CollateralLockDto[];
}

export class CreditStatsTotalsDto {
  @ApiProperty({ example: 320 })
  credits: number;

  @ApiProperty({ example: 84 })
  active: number;

  @ApiProperty({ example: 210 })
  settled: number;

  @ApiProperty({ example: 18 })
  cancelled: number;

  @ApiProperty({ example: 8 })
  expired: number;
}

export class CreditStatsExposureDto {
  @ApiProperty({ example: 42000000000, description: "Sum of active credit limits, in the credit base symbol" })
  activeCreditLimit: number;

  @ApiProperty({ example: 18600000000, description: "Sum drawn against those limits" })
  activeUsedCredit: number;

  @ApiProperty({ example: 24000000000, description: "Collateral backing them, valued in the credit base symbol" })
  activeCollateralValue: number;

  @ApiProperty({ example: 320.5, description: "Collateral backing them, as a quantity" })
  activeCollateralAmount: number;
}

export class CreditStatsRiskDto {
  @ApiProperty({ example: 2 })
  inDefault: number;

  @ApiProperty({ example: 5 })
  marginCall: number;

  @ApiProperty({ example: 11 })
  warning: number;

  @ApiProperty({ example: 3, description: "Awaiting an admin decision" })
  adminReview: number;

  @ApiProperty({ example: 1 })
  suspended: number;
}

export class CashoutTotalsDto {
  @ApiProperty({ example: 42 })
  count: number;

  @ApiProperty({ example: 6200000000, description: "Credit repaid through cash-outs, in the credit currency" })
  volume: number;

  @ApiProperty({ example: 31000000, description: "Cash-out fees earned, in the credit currency" })
  fees: number;

  @ApiProperty({ example: 1.8, description: "Conversion commission earned, in collateral units" })
  spreadProfit: number;

  @ApiProperty({ example: 44000000, description: "Total platform profit, valued in the credit currency" })
  systemProfit: number;

  @ApiProperty({ example: 12.4 })
  collateralConsumed: number;

  @ApiProperty({ example: 6200000000 })
  creditLimitReduction: number;

  @ApiProperty({ example: 30, description: "Cash-outs paid from the deposit wallet" })
  byDeposit: number;

  @ApiProperty({ example: 12, description: "Cash-outs paid by converting collateral" })
  byCollateral: number;
}

/** The credit dashboard's KPIs, with cash-out aggregates folded in. */
export class CreditStatsDto {
  @ApiProperty({ type: CreditStatsTotalsDto })
  totals: CreditStatsTotalsDto;

  @ApiProperty({ type: CreditStatsExposureDto })
  exposure: CreditStatsExposureDto;

  @ApiProperty({ type: CreditStatsRiskDto })
  risk: CreditStatsRiskDto;

  @ApiProperty({
    example: { PENDING_ADMIN_REVIEW: 3, CLOSED: 210 },
    additionalProperties: { type: "number" },
    description: "Facility counts by settlement state",
  })
  settlementDistribution: Record<string, number>;

  @ApiProperty({
    example: { OK: 70, WARNING: 11 },
    additionalProperties: { type: "number" },
    description: "Facility counts by risk state",
  })
  riskDistribution: Record<string, number>;

  @ApiProperty({ example: 3, description: "Settlements waiting on an admin" })
  pendingApproval: number;

  @ApiProperty({ type: CashoutTotalsDto })
  cashout: CashoutTotalsDto;
}
