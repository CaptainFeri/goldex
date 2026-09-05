import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DepositStatusEnum } from "../enum/deposit-status.enum";
import { SymbolRefDto } from "../../shared/dto/symbol-ref.dto";
import { UserRefDto } from "../../shared/dto/user-ref.dto";

/**
 * A deposit as the admin API returns it.
 *
 * `amount` is a decimal string in `symbol`'s own units. Clients format by
 * `symbol.slug`; the API never converts.
 */
export class DepositDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ type: UserRefDto })
  user?: UserRefDto;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiPropertyOptional({ type: SymbolRefDto })
  symbol?: SymbolRefDto;

  @ApiProperty({
    example: "manual",
    description: "Deposit channel: manual, payment-gateway, p2p, hdwallet, warehouse or borrow",
  })
  type: string;

  @ApiProperty({ example: "1250000000.00000000", description: "Decimal string, in the symbol's units" })
  amount: string;

  @ApiProperty({ enum: DepositStatusEnum, example: DepositStatusEnum.PENDING })
  status: DepositStatusEnum;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin who processed it" })
  adminId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Object name of the receipt in object storage" })
  picturePath?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Free-form payload; carries the OCR result under `ocr` for receipt-backed deposits",
  })
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  gatewayCode?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15T09:12:00.000Z" })
  completedAt?: Date | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  warehouseRequestId?: string | null;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  createAt: Date;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  updateAt: Date;
}
