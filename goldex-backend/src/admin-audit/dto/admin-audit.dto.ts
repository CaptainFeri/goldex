import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() adminId?: string;
  @ApiPropertyOptional({ description: "Resource family, e.g. `accounting/vouchers`." })
  @IsOptional() @IsString() @Length(1, 120) entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) entityId?: string;
  @ApiPropertyOptional({ description: "Substring of the method + route." })
  @IsOptional() @IsString() @Length(1, 200) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;

  @ApiPropertyOptional({ description: "Only refused or failed mutations." })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  failedOnly?: boolean;
}

export class AuditEntryDto {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true }) adminId: string | null;
  @ApiProperty({ nullable: true }) adminLabel: string | null;
  @ApiProperty({ nullable: true }) permission: string | null;
  @ApiProperty() action: string;
  @ApiProperty({ nullable: true }) entity: string | null;
  @ApiProperty({ nullable: true }) entityId: string | null;
  @ApiProperty({ nullable: true, description: "Only when the handler recorded one." })
  before: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, description: "The request body, with credentials redacted." })
  after: Record<string, unknown> | null;
  @ApiProperty({ nullable: true }) otpChallengeId: string | null;
  @ApiProperty({ nullable: true }) statusCode: number | null;
  @ApiProperty({ nullable: true }) errorMessage: string | null;
  @ApiProperty({ nullable: true }) ip: string | null;
  @ApiProperty({ nullable: true }) userAgent: string | null;
  @ApiProperty({ nullable: true }) durationMs: number | null;
  @ApiProperty() createAt: Date;
}
