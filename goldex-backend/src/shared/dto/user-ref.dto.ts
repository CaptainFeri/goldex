import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * A user as it appears embedded in another resource — enough to identify the
 * person in a table row without exposing the account record.
 *
 * Never add credentials, tokens, KYC documents or 2FA fields here: this DTO is
 * joined into withdrawals, deposits, orders and wallets, so anything added
 * leaks into all of them at once.
 */
export class UserRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ example: "علی" })
  firstName?: string;

  @ApiPropertyOptional({ example: "رضایی" })
  lastName?: string;

  @ApiPropertyOptional({ example: "09121234567" })
  phone?: string;

  @ApiPropertyOptional({ example: "user@mail.ir" })
  email?: string;
}
