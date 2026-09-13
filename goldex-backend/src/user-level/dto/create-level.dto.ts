import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { CreditEnforceModeEnum } from "../../credit/enum/credit-enforce-mode.enum";
import { CreditPairConfigDto } from "../../credit/dto/credit-pair-config.dto";
import { CashoutSourceEnum } from "../../credit/enum/cashout-source.enum";
import { SettlementMethodEnum } from "../../credit/enum/settlement-workflow-status.enum";
import { IsCreditPairConfigMap } from "../validator/credit-pair-config-map.validator";

export class CreateLevelDto {
  @IsString()
  @ApiProperty()
  name: string;

  @IsString()
  @ApiProperty()
  slug: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @ApiProperty({ required: false, default: 0 })
  priority?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, default: false })
  isDefault?: boolean;

  @IsOptional()
  @ApiProperty({ required: false, default: {} })
  features?: Record<string, any>;

  @IsOptional()
  @IsUUID("all", { each: true })
  @ApiProperty({ required: false, type: [String] })
  pairIds?: string[];

  // ── Credit v2 config ──────────────────────────────────────────────
  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, type: String })
  creditBaseSymbolId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditMaxLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditDrawdownPercent?: number;

  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiProperty({ required: false, enum: CreditEnforceModeEnum })
  creditEnforceOnDrawdown?: CreditEnforceModeEnum;

  @IsOptional()
  @IsEnum(CreditEnforceModeEnum)
  @ApiProperty({ required: false, enum: CreditEnforceModeEnum })
  creditEnforceOnExpiry?: CreditEnforceModeEnum;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false })
  creditEnforceRequestDeadline?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  creditMaxParallelRequests?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, default: true, description: "Whether KYC approval is required to open a self-service credit on this level" })
  creditRequireKyc?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, default: true, description: "Whether credit trading is allowed on this level" })
  creditTradingEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Max credit amount (0 = unlimited)" })
  creditMaxAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Max credit duration in days (0 = no expiry)" })
  creditMaxDurationDays?: number;

  // ── Credit risk measurement defaults ───────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Margin ratio (%) at which a facility is warned" })
  creditWarningMarginPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Margin ratio (%) at which a facility is margin-called" })
  creditMarginCallPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Margin ratio (%) at which positions are liquidated" })
  creditLiquidationMarginPercent?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Block exposure-increasing orders once warned" })
  creditReduceOnlyOnWarning?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Max chained credit trades (hops)" })
  creditMaxExecutionLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Smallest credit trade quantity" })
  creditMinTradeSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Largest credit trade quantity" })
  creditMaxTradeSize?: number;

  // ── Credit facility abilities ──────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Opening a facility requires admin approval" })
  creditRequireAdminApprovalForCreation?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    description:
      "Hours a credit request may await approval before it is auto-declined and the " +
      "collateral returned (0/omitted = no deadline)",
  })
  creditRequestApprovalTtlHours?: number;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Settling a facility requires admin approval" })
  creditRequireAdminApprovalForSettlement?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Users on this level may settle their own facility" })
  creditAllowUserSettlement?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Cashing out a single credit purchase is allowed" })
  creditCashoutEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({ required: false, description: "Platform fee (%) charged on a credit cash-out" })
  creditCashoutFeePercent?: number;

  @IsOptional()
  @IsEnum(CashoutSourceEnum, { each: true })
  @ApiProperty({
    required: false,
    isArray: true,
    enum: CashoutSourceEnum,
    description: "Wallets a cash-out may be paid from (omit for both)",
  })
  creditAllowedCashoutSources?: CashoutSourceEnum[];

  @IsOptional()
  @IsEnum(SettlementMethodEnum, { each: true })
  @ApiProperty({
    required: false,
    isArray: true,
    enum: SettlementMethodEnum,
    description: "Settlement methods offered on this level (omit for all)",
  })
  creditSettlementMethods?: SettlementMethodEnum[];

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ required: false, description: "Offsetting credit trades may be netted at settlement" })
  creditNettingEnabled?: boolean;

  // Keyed by price pair id; each value is validated as a CreditPairConfigDto so
  // a typo in the admin panel is rejected here rather than silently ignored in
  // the order path.
  @IsOptional()
  @IsCreditPairConfigMap()
  @ApiProperty({
    required: false,
    type: Object,
    description: "Per-pair credit configs keyed by price pair id",
  })
  creditConfigs?: Record<string, CreditPairConfigDto>;
}
