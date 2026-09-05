import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * A user as returned by the block/unblock endpoint.
 *
 * Field names are `firstname`/`lastname` (lower-case n), which is what the
 * service has always emitted and both panels read. Left as-is deliberately:
 * renaming would break callers for no gain.
 */
export class AdminUserDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ example: "علی" })
  firstname: string;

  @ApiPropertyOptional({ example: "رضایی" })
  lastname: string;

  @ApiPropertyOptional({ example: "user@mail.ir" })
  email: string;

  @ApiPropertyOptional({ nullable: true, description: "When the user completed registration" })
  registeredAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: "Non-null means blocked; the timestamp is when it happened",
  })
  blockedAt: Date;

  @ApiPropertyOptional()
  createdAt: Date;
}
