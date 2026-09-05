import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import {
  AccountingGranularity,
  AccountingMetric,
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSide,
  VoucherStatus,
  WalletSubset,
} from "../accounting.enums";

// ── §5.21 Accounting ──────────────────────────────────────────────────────

export class AccountingStatsDto {
  @ApiProperty({ example: "1284000000.00", description: "Positive ledger movement, decimal string" })
  income: string;

  @ApiProperty({ example: "312000000.00", description: "Negative ledger movement, as a positive figure" })
  expense: string;

  @ApiProperty({ example: "972000000.00", description: "income − expense" })
  netProfit: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 75.7,
    description: "netProfit ÷ income, as a percentage. Null when there was no income to divide by.",
  })
  marginPercent?: number | null;

  @ApiProperty({
    example: "IRR",
    description: "The unit every figure above is in. The API never converts; the panel shows toman.",
  })
  unit: string;
}

export class AccountingSeriesQueryDto {
  @ApiProperty({ enum: AccountingMetric })
  @IsEnum(AccountingMetric)
  metric: AccountingMetric;

  @ApiProperty({ enum: AccountingGranularity })
  @IsEnum(AccountingGranularity)
  granularity: AccountingGranularity;

  @ApiPropertyOptional({ example: 1405, description: "Jalali year. Defaults to the current one." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  year?: number;

  @ApiPropertyOptional({ example: 5, description: "Jalali month 1–12. Required for day and hour granularity." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ example: 12, description: "Jalali day 1–31. Required for hour granularity." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  day?: number;
}

export class AccountingSeriesPointDto {
  @ApiProperty({ example: "1405/05", description: "Jalali bucket key" })
  key: string;

  @ApiProperty({ example: "مرد", description: "Short label for the axis" })
  label: string;

  @ApiProperty({ example: "1284000000.00", description: "Decimal string; a percentage for the margin metric" })
  value: string;
}

export class AccountingSeriesDto {
  @ApiProperty({ enum: AccountingMetric })
  metric: AccountingMetric;

  @ApiProperty({ enum: AccountingGranularity })
  granularity: AccountingGranularity;

  @ApiPropertyOptional({
    nullable: true,
    example: "IRR",
    description: "Unit of `value`. Null for the margin metric, which is a percentage.",
  })
  unit?: string | null;

  @ApiProperty({ type: [AccountingSeriesPointDto], description: "Every bucket in range, zeroes included" })
  points: AccountingSeriesPointDto[];
}

export class AccountingLedgerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: "کارمزد", description: "Free text over the description" })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @ApiPropertyOptional({ example: "1000000", description: "Inclusive lower bound on the absolute amount" })
  @IsOptional()
  @IsNumberString()
  minAmount?: string;

  @ApiPropertyOptional({ example: "500000000" })
  @IsOptional()
  @IsNumberString()
  maxAmount?: string;

  @ApiPropertyOptional({ example: 1405, description: "Jalali year" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  year?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  day?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;
}

export class AccountingLedgerRowDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "COMMISSION_BUY" })
  type: string;

  @ApiProperty({ example: "کارمزد خرید سفارش ORD-1204" })
  description: string;

  @ApiProperty({ example: "1250000.00", description: "Signed: negative is money out" })
  amount: string;

  @ApiPropertyOptional({ nullable: true, example: "IRR" })
  unit?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "tgju" })
  providerKey?: string | null;

  @ApiProperty({ example: "2026-09-05T09:12:00.000Z" })
  date: Date;
}

// ── §5.22 Vouchers ────────────────────────────────────────────────────────

export class VoucherQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: "زرین", description: "Free text over the customer name" })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  customer?: string;

  @ApiPropertyOptional({ enum: CustomerType, description: "Omit for both" })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @ApiPropertyOptional({ enum: VoucherStatus })
  @IsOptional()
  @IsEnum(VoucherStatus)
  status?: VoucherStatus;

  @ApiPropertyOptional({ example: "1000000" })
  @IsOptional()
  @IsNumberString()
  amountFrom?: string;

  @ApiPropertyOptional({ example: "500000000" })
  @IsOptional()
  @IsNumberString()
  amountTo?: string;

  @ApiPropertyOptional({ example: "2026-08-01T00:00:00.000Z", description: "On the document date, not the row's creation" })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: "2026-09-01T00:00:00.000Z" })
  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class CreateVoucherDto {
  @ApiProperty({ enum: VoucherMovement, description: "The only direction input. `side` is derived from it." })
  @IsEnum(VoucherMovement)
  movement: VoucherMovement;

  @ApiPropertyOptional({ format: "uuid", description: "The customer, when they are a platform user" })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ example: "شرکت زرین تجارت", description: "Used when there is no `customerId`, and stored either way" })
  @IsString()
  @Length(1, 200)
  customerName: string;

  @ApiProperty({ enum: CustomerType })
  @IsEnum(CustomerType)
  customerType: CustomerType;

  @ApiProperty({ enum: VoucherCategory })
  @IsEnum(VoucherCategory)
  category: VoucherCategory;

  @ApiProperty({ format: "uuid", description: "The symbol the amount is in" })
  @IsUUID()
  symbolId: string;

  @ApiProperty({ example: "2450000000", description: "Positive, in the symbol's own units" })
  @IsNumberString()
  amount: string;

  @ApiProperty({ example: "DEPOSIT", description: "Wallet type, from the catalogs endpoint" })
  @IsString()
  @Length(1, 40)
  walletType: string;

  @ApiProperty({ enum: WalletSubset })
  @IsEnum(WalletSubset)
  walletSubset: WalletSubset;

  @ApiProperty({ example: "تسویه فاکتور خرید طلا" })
  @IsString()
  @Length(1, 500)
  description: string;

  @ApiPropertyOptional({ example: "بابت سفارش شماره 8451" })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  extraDescription?: string;

  @ApiProperty({ example: "2026-08-03T00:00:00.000Z", description: "The accounting date, which need not be today" })
  @IsString()
  documentDate: string;
}

export class ReviewVoucherDto {
  @ApiPropertyOptional({ example: "مدارک ناقص است", description: "Recorded against the decision" })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}

export class VoucherDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "DOC-14050012" })
  voucherCode: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  customerId?: string | null;

  @ApiProperty({ example: "شرکت زرین تجارت" })
  customerName: string;

  @ApiProperty({ enum: CustomerType })
  customerType: CustomerType;

  @ApiProperty({ enum: VoucherCategory })
  category: VoucherCategory;

  @ApiProperty({ example: "کارمزد", description: "The category's Persian label, so the client need not map it" })
  categoryLabel: string;

  @ApiProperty({ enum: VoucherMovement })
  movement: VoucherMovement;

  @ApiProperty({ enum: VoucherSide, description: "Derived from `movement`; never client-supplied" })
  side: VoucherSide;

  @ApiProperty({ example: "بستانکار" })
  sideLabel: string;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiPropertyOptional({ nullable: true, example: "IRR", description: "Format `amount` by this" })
  unit?: string | null;

  @ApiProperty({ example: "2450000000.00000000", description: "Always positive; direction is `side`" })
  amount: string;

  @ApiProperty({ example: "DEPOSIT" })
  walletType: string;

  @ApiProperty({ enum: WalletSubset })
  walletSubset: WalletSubset;

  @ApiProperty({ example: "نقد" })
  walletSubsetLabel: string;

  @ApiProperty({ example: "تسویه فاکتور خرید طلا" })
  description: string;

  @ApiPropertyOptional({ nullable: true })
  extraDescription?: string | null;

  @ApiProperty({ example: "2026-08-03T00:00:00.000Z" })
  documentDate: Date;

  @ApiProperty({ enum: VoucherStatus })
  status: VoucherStatus;

  @ApiProperty({ example: "ثبت نهایی" })
  statusLabel: string;

  @ApiProperty({ format: "uuid" })
  createdBy: string;

  @ApiPropertyOptional({ nullable: true, description: "The operator's identifier, for the «ثبت کننده» column" })
  createdByName?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  reviewedBy?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reviewNote?: string | null;

  @ApiProperty()
  createAt: Date;
}

export class CatalogOptionDto {
  @ApiProperty({ example: "fee", description: "The value to send back" })
  value: string;

  @ApiProperty({ example: "کارمزد", description: "What to show" })
  label: string;
}

export class VoucherCatalogsDto {
  @ApiProperty({ type: [CatalogOptionDto] })
  categories: CatalogOptionDto[];

  @ApiProperty({
    type: [CatalogOptionDto],
    description:
      "Real wallet types, not a list of currency labels. The panels' mock offered a rial wallet " +
      "and a toman wallet as two options; they are one wallet, and toman is a display convention.",
  })
  walletTypes: CatalogOptionDto[];

  @ApiProperty({ type: [CatalogOptionDto] })
  walletSubsets: CatalogOptionDto[];

  @ApiProperty({ type: [CatalogOptionDto], description: "Active symbols a voucher may be denominated in" })
  symbols: CatalogOptionDto[];

  @ApiProperty({ type: [CatalogOptionDto] })
  customerTypes: CatalogOptionDto[];

  @ApiProperty({ type: [CatalogOptionDto] })
  movements: CatalogOptionDto[];
}
