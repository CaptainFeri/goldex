import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { WithdrawStatusEnum } from "../enum/withdraw-status.enum";
import { SymbolRefDto } from "../../shared/dto/symbol-ref.dto";
import { UserRefDto } from "../../shared/dto/user-ref.dto";

/**
 * A withdrawal as the admin API returns it.
 *
 * `amount` is a decimal string in `symbol`'s own units — rial for a rial
 * symbol, grams for gold. Clients format by `symbol.slug`; the API never
 * converts.
 */
export class WithdrawDto {
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
    description: "Withdraw channel: manual, auto, p2p, warehouse or borrow",
  })
  type: string;

  @ApiProperty({ example: "1250000000.00000000", description: "Decimal string, in the symbol's units" })
  amount: string;

  @ApiProperty({ enum: WithdrawStatusEnum, example: WithdrawStatusEnum.PENDING })
  status: WithdrawStatusEnum;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin who processed it" })
  adminId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Operator note, shown on the review screen" })
  notes?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Object name of the receipt in object storage. Stable identifier; not fetchable on its own. " +
      "Render `pictureUrl` instead.",
  })
  picturePath?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "/api/v1/files/signed/eyJvIjoid2l0aGRyYXctYWJjLTIwMjYtMDktMDUuanBnIn0.KT6JbmTEN",
    description:
      "Short-lived URL serving the receipt, or null when there is none. Expires ~15 minutes " +
      "after the response was issued, carries its own authorization and needs no bearer token, " +
      "so it can go straight into an <img> tag. Re-fetch the record to get a fresh one; never " +
      "persist it.",
  })
  pictureUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Free-form payload; carries the OCR result under `ocr` for receipt-backed withdrawals",
    example: { ocr: { parsed: { amount: "12500000", transactionId: "870013" } } },
  })
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: "Gateway that executed it, for auto withdrawals" })
  gatewayCode?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "2026-07-15T09:12:00.000Z" })
  completedAt?: Date | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Set for warehouse-settled withdrawals" })
  warehouseRequestId?: string | null;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  createAt: Date;

  @ApiProperty({ example: "2026-07-15T09:12:00.000Z" })
  updateAt: Date;
}
