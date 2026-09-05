import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  AdminBankAccountStatusEnum,
} from "../enum/admin-bank-account-status.enum";

/**
 * A company bank account as the admin API returns it.
 *
 * Amounts are decimal strings in the account's own symbol. For a rial-family
 * account that symbol is IRT (toman) — the bank's own rial figures are
 * converted at the adapter boundary, never here.
 *
 * @see docs/PARSZARGAR-ADMIN-API-PLAN.md §3.2
 */
export class AdminBankAccountDto {
  @ApiProperty({ format: "uuid", example: "5f7c1c62-4d2e-4a5e-9b1a-0f3a2c9e1a77" })
  id: string;

  @ApiProperty({ example: "حساب تسویه ملت" })
  title: string;

  @ApiProperty({ example: "بانک ملت" })
  bankName: string;

  @ApiProperty({ example: "شرکت پارس زرگر", description: "Must match what the IBAN inquiry returns" })
  ownerName: string;

  @ApiPropertyOptional({ example: "1234567890", nullable: true })
  accountNumber?: string | null;

  @ApiPropertyOptional({ example: "6104337812345678", nullable: true })
  cardNumber?: string | null;

  @ApiPropertyOptional({ example: "IR820540102680020817909002", nullable: true })
  iban?: string | null;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiPropertyOptional({ description: "Joined symbol, when the query includes it" })
  symbol?: Record<string, unknown>;

  @ApiProperty({ example: true, description: "Offered as a destination to depositors" })
  useForDeposit: boolean;

  @ApiProperty({ example: false, description: "Used as the source for admin payouts" })
  useForWithdraw: boolean;

  @ApiProperty({ example: 0, description: "Lower is tried first, per direction" })
  priority: number;

  @ApiPropertyOptional({ example: "5000000000", nullable: true, description: "Decimal string, toman" })
  depositDailyLimit?: string | null;

  @ApiPropertyOptional({ example: "500000000", nullable: true, description: "Decimal string, toman" })
  depositPerTxLimit?: string | null;

  @ApiPropertyOptional({ example: "5000000000", nullable: true, description: "Decimal string, toman" })
  withdrawDailyLimit?: string | null;

  @ApiPropertyOptional({ example: "500000000", nullable: true, description: "Decimal string, toman" })
  withdrawPerTxLimit?: string | null;

  @ApiProperty({ example: "125000000", description: "Reset to 0 once the rollover date passes" })
  depositUsedToday: string;

  @ApiProperty({ example: "0" })
  withdrawUsedToday: string;

  @ApiPropertyOptional({ example: 8, nullable: true, minimum: 0, maximum: 23 })
  activeFromHour?: number | null;

  @ApiPropertyOptional({
    example: 22,
    nullable: true,
    minimum: 0,
    maximum: 23,
    description: "A window like 22→6 wraps past midnight",
  })
  activeToHour?: number | null;

  @ApiProperty({ enum: AdminBankAccountStatusEnum, example: AdminBankAccountStatusEnum.ACTIVE })
  status: AdminBankAccountStatusEnum;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  createAt: Date;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  updateAt: Date;
}
