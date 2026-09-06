import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { FileTargetEnum } from "../../file/enum/file.target.enum";
import { KycDocumentStatus } from "../../user/entity/user.kyc.document.entity";
import { UserRefDto } from "../../shared/dto/user-ref.dto";

/** A KYC document as the review queue returns it. */
export class KycDocumentDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ type: UserRefDto, description: "Joined when the query includes it" })
  user?: UserRefDto;

  @ApiProperty({
    enum: FileTargetEnum,
    description: "Which document this is — national card, selfie, and so on",
  })
  fileTarget: FileTargetEnum;

  @ApiProperty({ example: "national-id-front.jpg" })
  fileName: string;

  @ApiProperty({
    example: "licence-3f9a1c4d-2026-09-05.jpg",
    description:
      "Object name in storage. Stable identifier; not fetchable on its own. Render `documentUrl` instead.",
  })
  fileUrl: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "/api/v1/files/signed/eyJvIjoibGljZW5jZS0zZjlhMWM0ZC0yMDI2LTA5LTA1LmpwZyJ9.KT6JbmTEN",
    description:
      "Short-lived URL serving the document. Expires ~15 minutes after the response was issued, " +
      "carries its own authorization and needs no bearer token, so it can go straight into an <img> " +
      "tag. Re-fetch the document to get a fresh one; never persist it.",
  })
  documentUrl?: string | null;

  @ApiProperty({ example: 248_512, description: "Bytes" })
  fileSize: number;

  @ApiProperty({ example: "image/jpeg" })
  mimeType: string;

  @ApiPropertyOptional({ nullable: true, description: "Storage etag, for de-duplication" })
  etag?: string;

  @ApiProperty({ enum: KycDocumentStatus, example: KycDocumentStatus.PENDING })
  status: KycDocumentStatus;

  @ApiPropertyOptional({ nullable: true, description: "Set when status is rejected; shown to the user" })
  rejectionReason?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Free-form; carries OCR output where available" })
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin who reviewed it" })
  reviewedBy?: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * The document queue's page.
 *
 * Note the field names: this endpoint predates the shared contract and uses
 * `limit` where `PaginatedDto` uses `pageSize`. Left alone for now so the
 * review screens keep working; it is on the list to align.
 */
export class KycDocumentPageDto {
  @ApiProperty({ type: [KycDocumentDto] })
  items: KycDocumentDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10, description: "Rows per page — the older name for `pageSize`" })
  limit: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

/** One row of the status × document-type breakdown. */
export class KycStatsBreakdownDto {
  @ApiProperty({ enum: KycDocumentStatus })
  status: KycDocumentStatus;

  @ApiProperty({ enum: FileTargetEnum })
  fileTarget: FileTargetEnum;

  @ApiProperty({ example: "12", description: "Raw SQL COUNT — a string, not a number" })
  count: string;
}

export class KycDocumentStatsDto {
  @ApiProperty({ example: 320, description: "Every document, all statuses" })
  total: number;

  @ApiProperty({ type: [KycStatsBreakdownDto], description: "Counts grouped by status and document type" })
  breakdown: KycStatsBreakdownDto[];
}

/** A user with their KYC state, for the verification list. */
export class KycUserListItemDto {
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

  @ApiPropertyOptional({ nullable: true, example: "0012345678" })
  nationalId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "As supplied on the KYC record" })
  birthDate?: string | null;

  @ApiProperty({ example: 0, description: "0 when the user has no KYC record yet" })
  kycLevel: number;

  @ApiProperty({ example: 0, description: "0 when the user has no KYC record yet" })
  kycStatus: number;

  @ApiPropertyOptional({ nullable: true })
  verifiedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  rejectReason?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Non-null means the account is blocked" })
  blockedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;
}

/**
 * The KYC user list.
 *
 * Carries `items` and `total` only — no page echo, because the endpoint takes
 * its paging as loose query params rather than the shared DTO. Also on the
 * list to align.
 */
export class KycUserListDto {
  @ApiProperty({ type: [KycUserListItemDto] })
  items: KycUserListItemDto[];

  @ApiProperty({ example: 12840 })
  total: number;
}
