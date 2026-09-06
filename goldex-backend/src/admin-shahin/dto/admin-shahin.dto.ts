import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Min,
} from "class-validator";

export const TRANSFER_METHODS = ["satna", "paya", "pol", "account"] as const;

export class ShahinAccountDto {
  @ApiProperty() id: number;
  @ApiProperty() accountNumber: string;
  @ApiProperty({ nullable: true }) iban: string | null;
  @ApiProperty({ nullable: true }) ownerName: string | null;
  @ApiProperty({ nullable: true }) bankName: string | null;
  @ApiProperty() bankCode: string;
  @ApiProperty({ nullable: true, description: "Rial. Last known — refresh with /balance." })
  balance: string | null;
  @ApiProperty() accountStatus: string;
  @ApiProperty({ nullable: true }) lastAccessedAt: Date | null;
}

export class AccountBalanceDto {
  @ApiProperty() accountNumber: string;
  @ApiProperty({ nullable: true, description: "Rial." }) availableBalance: string | null;
  @ApiProperty({ nullable: true, description: "Rial." }) effectiveBalance: string | null;
  @ApiProperty({ description: "When the bank was actually asked." }) fetchedAt: Date;
}

export class StatementQueryDto {
  @ApiPropertyOptional({ description: "ISO date; inclusive." })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: "ISO date; inclusive." })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: "Rial." })
  @IsOptional()
  @IsNumberString()
  minAmount?: string;

  @ApiPropertyOptional({ description: "Rial." })
  @IsOptional()
  @IsNumberString()
  maxAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 64)
  trackNo?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class StatementRowDto {
  @ApiProperty({ nullable: true }) date: string | null;
  @ApiProperty({ nullable: true }) description: string | null;
  @ApiProperty({ nullable: true, description: "Rial." }) amount: string | null;
  @ApiProperty({ nullable: true, description: "Rial." }) balance: string | null;
  @ApiProperty({ nullable: true }) trackNo: string | null;
  @ApiProperty({ enum: ["credit", "debit"], nullable: true }) direction: string | null;
}

export class InquiryDto {
  @ApiProperty({ description: "The destination account number or IBAN to look up." })
  @IsString()
  @Length(4, 40)
  destAccount: string;
}

export class InquiryResultDto {
  @ApiProperty({ nullable: true }) ownerName: string | null;
  @ApiProperty() accountNumber: string;
  @ApiProperty({ nullable: true }) bankName: string | null;
}

/**
 * Field names match the `shahin.transfer` OTP descriptor exactly — those three
 * are hashed into the challenge, so renaming one here silently unbinds the
 * confirmation.
 */
export class TransferDto {
  @ApiProperty({ enum: TRANSFER_METHODS })
  @IsIn(TRANSFER_METHODS as unknown as string[])
  method: string;

  @ApiProperty()
  @IsString()
  @Length(4, 40)
  sourceAccount: string;

  @ApiProperty()
  @IsString()
  @Length(4, 40)
  destinationAccount: string;

  @ApiProperty({ description: "Rial." })
  @IsNumberString()
  amount: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;

  @ApiProperty({ description: "From POST /admin/operations/otp, scope `shahin.transfer`." })
  @IsString()
  @Length(1, 64)
  challengeId: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  otp: string;
}

export class BatchTransferItemDto {
  @ApiProperty() @IsString() @Length(4, 40) destinationAccount: string;
  @ApiProperty({ description: "Rial." }) @IsNumberString() amount: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) description?: string;
}

export class BatchTransferDto {
  @ApiProperty({ enum: TRANSFER_METHODS })
  @IsIn(TRANSFER_METHODS as unknown as string[])
  method: string;

  @ApiProperty()
  @IsString()
  @Length(4, 40)
  sourceAccount: string;

  @ApiProperty({ type: [BatchTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => BatchTransferItemDto)
  items: BatchTransferItemDto[];

  @ApiProperty({ description: "The destination accounts, so one code covers the whole batch." })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  refIds: string[];

  @ApiProperty() @IsString() @Length(1, 64) challengeId: string;
  @ApiProperty() @IsString() @Length(4, 8) otp: string;
}

export class StatementExportQueryDto {
  @ApiProperty({ description: "Comma-separated stored account ids." })
  @IsString()
  @Length(1, 400)
  accountIds: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
}

export class OpenBankingConnectionDto {
  @ApiProperty() accountId: number;
  @ApiProperty() accountNumber: string;
  @ApiProperty({ nullable: true }) bankName: string | null;
  @ApiProperty({ description: "Whether the last call to the bank for this account succeeded." })
  connected: boolean;
  @ApiProperty({ nullable: true, description: "When the bank last answered for this account." })
  lastSyncAt: Date | null;
  @ApiProperty({
    nullable: true,
    description:
      "Reported by the bank when it tells us. Null means it did not — not that access is unlimited.",
  })
  accessScope: string | null;
  @ApiProperty({
    nullable: true,
    description: "Null unless the upstream supplies it; this service does not infer an expiry.",
  })
  consentExpiresAt: Date | null;
  @ApiProperty({ nullable: true }) lastError: string | null;
}
