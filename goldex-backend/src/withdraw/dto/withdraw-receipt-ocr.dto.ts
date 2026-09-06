import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Fields the OCR service extracts from a bank receipt.
 *
 * Every field is nullable: OCR on a photographed slip routinely misses some,
 * and the operator corrects them on screen. A null here means "not read",
 * not "not present on the receipt".
 *
 * Amounts are **rial**, because that is what is printed on the slip.
 */
export class ReceiptOcrParsedDto {
  @ApiPropertyOptional({ nullable: true, example: "1404/06/15", description: "Jalali, as printed" })
  date?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "12500000", description: "Rial, as printed" })
  amount?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "870013" })
  transactionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  cardNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  accountNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  sourceCard?: string | null;

  @ApiPropertyOptional({ nullable: true })
  destCard?: string | null;
}

export class ReceiptOcrResultDto {
  @ApiProperty({
    example: true,
    description: "False when OCR failed; the other fields are then empty and the upload still succeeded",
  })
  success: boolean;

  @ApiProperty({ type: [String], description: "Raw text lines, in reading order" })
  texts: string[];

  @ApiProperty({ type: ReceiptOcrParsedDto })
  parsed: ReceiptOcrParsedDto;

  @ApiProperty({ example: "", description: "Unsegmented OCR output, for debugging" })
  raw: string;
}

/**
 * Response to uploading a withdrawal receipt.
 *
 * The upload and the OCR succeed independently: a failed read still returns
 * the stored object name with `ocr.success = false`, so the operator can key
 * the values in by hand rather than losing the file.
 */
export class WithdrawReceiptOcrDto {
  @ApiProperty({
    example: "withdraw-admin/5f7c.../1752570720000-receipt.jpg",
    description: "Object name in storage; persist this as the withdrawal's picturePath",
  })
  url: string;

  @ApiProperty({ type: ReceiptOcrResultDto })
  ocr: ReceiptOcrResultDto;
}
