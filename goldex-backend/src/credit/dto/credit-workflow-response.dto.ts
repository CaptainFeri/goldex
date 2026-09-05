import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CreditDto } from "./credit-response.dto";

/**
 * One delivery-based settlement workflow.
 *
 * It advances through a fixed sequence — requested, admin review, valuation,
 * method selection, funding, receipt, verification, liability cleared, asset
 * settled, collateral released, closed — and every action endpoint returns this
 * same record at its new stage. Read `status` to know where it is; the
 * amount fields fill in as the stages complete.
 */
export class CreditSettlementDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  creditId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The trade being settled, when scoped to one" })
  creditOrderId?: string | null;

  @ApiProperty({
    example: "PENDING_ADMIN_REVIEW",
    description: "Stage in the workflow; the action endpoints move it forward one step at a time",
  })
  status: string;

  @ApiPropertyOptional({ nullable: true, description: "Chosen settlement method, once selected" })
  method?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  requiredAssetSymbolId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Asset the user must deliver, in that symbol's units" })
  requiredAmount?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Delivered so far" })
  receivedAmount?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Collateral valued at settlement, in the credit currency" })
  collateralValue?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Outstanding exposure, in the credit currency" })
  exposureValue?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Exposure minus collateral, when positive" })
  shortfall?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "What the user must top up to clear the shortfall" })
  requiredTopUp?: string | null;

  @ApiPropertyOptional({ nullable: true })
  fundedAmount?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Collateral released back on close" })
  releaseAmount?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Realised profit or loss, in the credit currency" })
  realizedPnl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  reviewedByAdminId?: string | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/** One cash-out of a credit purchase. */
export class CreditCashoutDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  creditId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  creditOrderId?: string | null;

  @ApiProperty({ example: "DEPOSIT", description: "DEPOSIT charges the wallet; COLLATERAL converts collateral" })
  source: string;

  @ApiProperty({ example: "120000000.00000000", description: "Credit repaid, in the credit currency" })
  amount: string;

  @ApiProperty({ example: "0.50", description: "Fee rate, percent" })
  feePercent: string;

  @ApiProperty({ example: "600000.00000000", description: "Fee charged, in the credit currency" })
  feeAmount: string;

  @ApiProperty({ example: "0.02000000", description: "Conversion commission earned, in collateral units" })
  spreadProfit: string;

  @ApiProperty({ example: "620000.00000000", description: "Total platform profit, in the credit currency" })
  systemProfitValue: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  assetSymbolId?: string | null;

  @ApiProperty({ example: "1.50000000", description: "Purchased asset released, in the asset symbol" })
  assetAmount: string;

  @ApiProperty({ example: "0.30000000", description: "Collateral consumed, in collateral units" })
  collateralConsumed: string;

  @ApiPropertyOptional({ nullable: true, description: "Mark price used for the conversion" })
  markPrice?: string | null;

  @ApiProperty({ example: "120000000.00000000", description: "How much the credit limit fell by" })
  creditLimitReduction: string;

  @ApiProperty({ example: "1.50000000" })
  sellCapacityReduction: string;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty()
  createAt: Date;
}

/** One trade that can still be cashed out. */
export class CashoutTradeOptionDto {
  @ApiProperty({ format: "uuid" })
  creditOrderId: string;

  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ example: "ORD-140504-0091" })
  orderCode: string;

  @ApiProperty({ example: "XAU/IRR" })
  pairKey: string;

  @ApiProperty({ example: 1.5 })
  executedQuantity: number;

  @ApiProperty({ example: 74626865.67, description: "Entry price, in the credit currency" })
  price: number;

  @ApiPropertyOptional({ nullable: true })
  executedAt?: Date | null;

  @ApiProperty({ example: 111940298, description: "Credit repaid by cashing this out, in the credit currency" })
  amount: number;

  @ApiProperty({ example: 0.5, description: "Fee rate, percent" })
  feePercent: number;

  @ApiProperty({ example: 559701, description: "Fee on this trade, in the credit currency" })
  feeAmount: number;

  @ApiProperty({ example: 112499999, description: "amount + feeAmount — what the chosen source is charged" })
  totalDue: number;

  @ApiProperty({ example: 559701, description: "Platform profit this books, in the credit currency" })
  systemProfitValue: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  assetSymbolId?: string | null;

  @ApiProperty({ example: "XAU" })
  assetSymbolSlug: string;

  @ApiProperty({ example: 1.5, description: "Purchased asset released to the deposit wallet" })
  assetAmount: number;
}

/**
 * What a facility can currently be cashed out with.
 *
 * When `supported` is false, `reason` says why — the facility is not active, or
 * it predates the cash-out fields — and `trades` will be empty. Every other
 * field is still populated, so the screen can explain itself rather than
 * rendering blank.
 */
export class CashoutOptionsDto {
  @ApiProperty({ example: true })
  supported: boolean;

  @ApiPropertyOptional({
    nullable: true,
    example: "CREDIT_NOT_ACTIVE",
    description: "Set when `supported` is false: CREDIT_NOT_ACTIVE or CASHOUT_NOT_SUPPORTED_FOR_LEGACY_CREDIT",
  })
  reason?: string | null;

  @ApiProperty({ format: "uuid" })
  creditId: string;

  @ApiProperty({ example: "CR-140504-0012" })
  creditCode: string;

  @ApiProperty({ example: 74626865.67, description: "Collateral mark price, in the credit currency" })
  markPrice: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  creditBaseSymbolId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  collateralSymbolId?: string | null;

  @ApiProperty({ example: 250000000, description: "Deposit wallet balance available to pay with" })
  depositBalance: number;

  @ApiProperty({ example: 8.2, description: "Collateral free to convert, in collateral units" })
  collateralAvailable: number;

  @ApiProperty({ example: 0.5, description: "Facility cash-out fee rate, percent" })
  feePercent: number;

  @ApiProperty({ example: 0.25, description: "Commission booked when collateral is converted, percent" })
  collateralConversionPercent: number;

  @ApiProperty({ type: [CashoutTradeOptionDto] })
  trades: CashoutTradeOptionDto[];
}

export class CreditPnlOrderDto {
  @ApiProperty({ format: "uuid" })
  orderId: string;

  @ApiProperty({ example: "BUY" })
  side: string;

  @ApiProperty({ example: 74626865.67 })
  entryPrice: number;

  @ApiPropertyOptional({ nullable: true, description: "Null when no mark price is available" })
  currentPrice?: number | null;

  @ApiProperty({ example: 1.5 })
  quantity: number;

  @ApiProperty({ example: 1.5 })
  executedQuantity: number;

  @ApiProperty({ example: 1200000, description: "Signed, in the credit currency" })
  pnl: number;

  @ApiProperty({ example: "COMPLETED" })
  status: string;

  @ApiProperty({ example: "XAU/IRR" })
  pairKey: string;
}

/** Profit and loss on a facility's trades, valued in the credit currency. */
export class CreditPnlDto {
  @ApiProperty({ example: 1800000, description: "realized + unrealized" })
  totalPnL: number;

  @ApiProperty({ example: 600000, description: "Booked on closed trades" })
  realizedPnL: number;

  @ApiProperty({ example: 1200000, description: "Mark-to-market on open trades" })
  unrealizedPnL: number;

  @ApiProperty({ type: [CreditPnlOrderDto] })
  orders: CreditPnlOrderDto[];
}

export class CreditRiskBalanceDto {
  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty({ example: "XAU" })
  symbolSlug: string;

  @ApiProperty({ example: 1.5 })
  freeBalance: number;

  @ApiProperty({ example: 0 })
  lockedBalance: number;

  @ApiProperty({ example: 0 })
  creditBalance: number;
}

/**
 * A facility's live risk picture.
 *
 * `valuation` needs a mark price. When none is available it is null and
 * `stateError` says why — the screen should show that rather than treating the
 * facility as healthy.
 */
export class CreditRiskDto {
  @ApiProperty({ type: CreditDto })
  credit: CreditDto;

  @ApiPropertyOptional({
    nullable: true,
    description: "Computed collateral/exposure state; null when it could not be valued",
  })
  valuation?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "CREDIT_NO_MARK_PRICE",
    description: "Why `valuation` is null",
  })
  stateError?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Whether it could settle now; null when unvalued" })
  eligible?: boolean | null;

  @ApiProperty({ example: 120000000, description: "Recomputed from completed orders, not read off the row" })
  usedCredit: number;

  @ApiProperty({ example: 380000000, description: "creditLimit − usedCredit, floored at zero" })
  availableCredit: number;

  @ApiProperty({ example: 500000000 })
  creditLimit: number;

  @ApiProperty({ type: [CreditRiskBalanceDto], description: "The user's CREDIT wallets" })
  balances: CreditRiskBalanceDto[];

  @ApiProperty({ example: false })
  suspended: boolean;
}

export class BaseSymbolPositionDto {
  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty({ example: "XAU" })
  baseSymbolSlug: string;

  @ApiProperty({
    example: 1.5,
    description: "Net position in that symbol — signed, so negative means the user still owes it",
  })
  netXau: number;

  @ApiProperty({ example: 74626865.67, description: "Mark price used, in the credit currency" })
  markPrice: number;
}

/**
 * Read-only preview of whether a facility can settle right now.
 *
 * Both panels show this before enabling Settle, so it explains the gate rather
 * than just refusing: `positions` says what is still owed per symbol, and
 * `shortfall` is what would have to be covered.
 */
export class SettlementEligibilityDto {
  @ApiProperty({ example: true, description: "True when the credit wallets net to zero or better" })
  eligible: boolean;

  @ApiProperty({
    example: false,
    description: "True for facilities opened before the collateral fields existed; they settle on the old path",
  })
  legacy: boolean;

  @ApiPropertyOptional({ nullable: true, description: "Null when no mark price is available" })
  markPrice?: number | null;

  @ApiProperty({ type: [BaseSymbolPositionDto] })
  positions: BaseSymbolPositionDto[];

  @ApiProperty({ example: 12000000, description: "Net worth of the position, in the credit currency" })
  netEquity: number;

  @ApiProperty({ example: 0, description: "How far equity falls short of zero" })
  deficit: number;

  @ApiProperty({ example: 0, description: "What must be covered before the facility can close" })
  shortfall: number;

  @ApiProperty({ example: 932835820, description: "Collateral valued now, in the credit currency" })
  collateralValue: number;
}
