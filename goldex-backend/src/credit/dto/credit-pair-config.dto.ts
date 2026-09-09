import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { CreditEnforceModeEnum } from "../enum/credit-enforce-mode.enum";

/**
 * Credit rules scoped to one price pair inside one user level.
 *
 * A level answers "may this user trade on credit at all"; this answers "on what
 * terms, on this pair". Gold against rial and dollar against rial are different
 * risks, so leverage, the margin-call ladder, the exposure caps and the reaction
 * to a breach are all set per pair. Every field is optional: an unset field
 * falls back to the level default, and an unset level default means the rule is
 * not enforced.
 */
export class CreditPairConfigDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: "Allow credit trading on this pair" })
  creditTradingEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max leverage when the collateral trades on this pair" })
  creditMaxLeverage?: number;

  // ── Drawdown (loss against the frozen collateral) ────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Drawdown threshold (% of collateral value)" })
  creditDrawdownPercent?: number;

  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiPropertyOptional({ enum: CreditEnforceModeEnum, description: "Reaction when drawdown is hit" })
  creditEnforceOnDrawdown?: CreditEnforceModeEnum;

  // ── Margin-call ladder (equity as a fraction of open exposure) ────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Margin ratio (%) at which the facility is warned" })
  creditWarningMarginPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Margin ratio (%) at which the facility is margin-called" })
  creditMarginCallPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiPropertyOptional({
    description: "Margin ratio (%) at which open positions are force-liquidated",
  })
  creditLiquidationMarginPercent?: number;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: "Block exposure-increasing orders once the facility is warned or margin-called",
  })
  creditReduceOnlyOnWarning?: boolean;

  // ── Deadlines and their enforcement ──────────────────────────────
  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiPropertyOptional({
    enum: CreditEnforceModeEnum,
    description: "Reaction when the facility passes its settlement deadline",
  })
  creditEnforceOnExpiry?: CreditEnforceModeEnum;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description:
      "Force-close a credit request on this pair once it passes the pair's pend deadline",
  })
  creditEnforceRequestDeadline?: boolean;

  // ── Exposure caps ────────────────────────────────────────────────
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Concurrent open credit requests on this pair" })
  creditMaxParallelRequests?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max chained credit trades (hops) on this pair" })
  creditMaxExecutionLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max notional exposure on this pair, in credit-base units" })
  creditMaxNotional?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max fraction (0..1) of collateral lockable on this pair" })
  creditMaxLockedCollateral?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Smallest credit trade quantity accepted on this pair" })
  creditMinTradeSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Largest credit trade quantity accepted on this pair" })
  creditMaxTradeSize?: number;

  // ── Terms for opening a facility collateralised on this pair ──────
  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: "Credit currency for this pair (its quote symbol)" })
  creditBaseSymbolId?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: "Require KYC to open a facility against this pair" })
  creditRequireKyc?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max credit limit against this pair (0 = unlimited)" })
  creditMaxAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiPropertyOptional({ description: "Max facility duration in days against this pair (0 = none)" })
  creditMaxDurationDays?: number;
}

/** The same shape as plain data, for the level's `creditConfigs` jsonb. */
export type CreditPairConfig = Partial<CreditPairConfigDto>;
