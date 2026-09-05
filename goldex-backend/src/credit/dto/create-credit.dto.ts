import { IsUUID, IsNumber, IsBoolean, IsOptional, IsString, Min, Max, IsDateString, ValidateNested, ArrayMinSize, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class FrozenWalletDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

export class IncreaseWalletDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;
}

export class CreateCreditDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  // Optional wallet that receives the credit amount. Defaults to the user's RIAL
  // wallet when omitted. The credit amount is denominated in this wallet's symbol.
  @ApiProperty({ required: false, description: "Optional wallet to credit the amount into (defaults to RIAL wallet)" })
  @IsOptional()
  @ValidateIf((o) => o.creditWalletId !== "" && o.creditWalletId !== null && o.creditWalletId !== undefined)
  @IsUUID()
  creditWalletId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  hasCallMargin?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  callMarginPercent?: number;

  @ApiProperty({ required: false, default: 24 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  reminderTimerHours?: number;

  @ApiProperty({ required: false, description: "Optional expiry date (credits don't expire by default)" })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxConcurrentOrders?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  maxTradeChainDepth?: number;

  @ApiProperty({ required: false, description: "Max nominal (notional) exposure, in credit base units (0 = unlimited)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxCreditNotional?: number;

  @ApiProperty({ required: false, description: "Max fraction (0..1) of total collateral that may be locked at once" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  maxTotalLockedCollateral?: number;

  @ApiProperty({ required: false, default: 8, description: "Green phase duration in hours" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  greenDurationHours?: number;

  @ApiProperty({ required: false, default: 4, description: "Yellow phase duration in hours" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  yellowDurationHours?: number;

  @ApiProperty({ required: false, default: 4, description: "Red phase duration in hours" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  redDurationHours?: number;

  @ApiProperty({ required: false, type: [FrozenWalletDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => FrozenWalletDto)
  frozenWallets?: FrozenWalletDto[];

  // Wallets that receive the credit amount (each with its own amount). When
  // omitted, creditWalletId+amount is used (single wallet) for backwards
  // compatibility. The total credit amount is the sum of these allocations.
  @ApiProperty({ required: false, type: [IncreaseWalletDto], description: "Wallets to receive the credit amount (defaults to creditWalletId/amount)" })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => IncreaseWalletDto)
  increasedWallets?: IncreaseWalletDto[];
}
