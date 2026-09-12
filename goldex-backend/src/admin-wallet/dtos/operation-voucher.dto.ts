import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CustomerType, VoucherCategory } from "../../admin-accounting/accounting.enums";

/**
 * The accounting voucher an admin must file with a balance change.
 *
 * No deposit or withdrawal is made without one, so this is required wherever the
 * wallet's total changes. It asks only for what cannot be derived: the customer,
 * symbol, amount, wallet, bucket and direction all come from the operation
 * itself, which is deliberate — a field the operator retypes is a field that can
 * disagree with the money that actually moved.
 */
export class OperationVoucherDto {
  @ApiProperty({
    enum: VoucherCategory,
    description: "What the entry is for",
  })
  @IsEnum(VoucherCategory)
  category: VoucherCategory;

  @ApiProperty({
    description: "Why this balance changed. Recorded on the voucher and shown to accounting.",
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({
    enum: CustomerType,
    description: "Whether the counterparty is invoiced. Defaults to informal.",
  })
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @ApiPropertyOptional({
    description: "The accounting date, which need not be today. Defaults to now.",
  })
  @IsOptional()
  @IsISO8601()
  documentDate?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  extraDescription?: string;
}
