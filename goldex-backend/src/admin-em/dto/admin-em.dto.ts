import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { EmRequestType, EmSearchBy, EmStatus } from "../em.enums";

export class EmPartyDto {
  @ApiProperty({ nullable: true }) userId: string | null;
  @ApiProperty({ nullable: true }) name: string | null;
  @ApiProperty({ nullable: true }) phone: string | null;
}

export class EmProofDto {
  @ApiProperty() id: string;
  @ApiProperty() matchId: string;
  @ApiProperty({ description: "Rial." }) amount: string;
  @ApiProperty({ nullable: true }) sourceAccount: string | null;
  @ApiProperty({ nullable: true }) destinationAccount: string | null;
  @ApiProperty({ nullable: true }) trackingCode: string | null;
  @ApiProperty({ nullable: true }) paidAt: Date | null;
  @ApiProperty({ nullable: true, description: "Short-lived signed URL; null when no receipt was uploaded." })
  receiptUrl: string | null;
  @ApiProperty({ description: "The OCR disagreed with what was entered." }) ocrMismatch: boolean;
  @ApiProperty() createAt: Date;
}

export class EmRequestRowDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: EmRequestType }) type: EmRequestType;
  @ApiProperty({ enum: EmStatus }) status: EmStatus;
  @ApiProperty({ description: "Rial." }) amount: string;
  @ApiProperty({ nullable: true }) symbolSlug: string | null;
  @ApiProperty({ type: EmPartyDto, description: "کاربر درخواست‌کننده" }) requester: EmPartyDto;
  @ApiProperty({
    type: EmPartyDto,
    nullable: true,
    description: "کاربر انجام‌دهنده — the depositor, or the acting admin on a company settlement.",
  })
  performer: EmPartyDto | null;
  @ApiProperty({ nullable: true, description: "حساب مقصد" }) destinationAccount: string | null;
  @ApiProperty({ nullable: true, description: "«حساب داده شده» — the admin account assigned to settle." })
  assignedAccount: string | null;
  @ApiProperty({
    nullable: true,
    description: "A timestamp, not a rendered duration — the countdown belongs on the client.",
  })
  expiresAt: Date | null;
  @ApiProperty({ description: "دارای لف. Operator-set; nothing in P2P implies it." })
  hasEnclosure: boolean;
  @ApiProperty() proofCount: number;
  @ApiProperty() createAt: Date;
}

export class EmRequestDetailDto extends EmRequestRowDto {
  @ApiProperty({ type: EmProofDto, isArray: true, description: "One per match; a request fans out to N." })
  proofs: EmProofDto[];
  @ApiProperty({ isArray: true, type: Object, description: "Parts and their matches, for the stacked cells." })
  parts: unknown[];
  @ApiProperty({ nullable: true, description: "The open escalation, when one exists." })
  escalationId: string | null;
}

export class EmQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EmStatus })
  @IsOptional()
  @IsEnum(EmStatus)
  status?: EmStatus;

  @ApiPropertyOptional({ enum: EmRequestType })
  @IsOptional()
  @IsEnum(EmRequestType)
  type?: EmRequestType;

  @ApiPropertyOptional({ enum: EmSearchBy, description: "Which field `q` searches." })
  @IsOptional()
  @IsEnum(EmSearchBy)
  searchBy?: EmSearchBy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;
}

export class EmStatsDto {
  @ApiProperty() total: number;
  @ApiProperty({ description: "در انتظار دریافت حساب" }) awaitingAccount: number;
  @ApiProperty({ description: "در انتظار دریافت فیش" }) awaitingReceipt: number;
  @ApiProperty({ description: "فیش پرداخت‌شده" }) receiptPaid: number;
  @ApiProperty({ description: "رد شده" }) rejected: number;
}

export class AssignAccountDto {
  @ApiProperty({ description: "An `admin_bank_account` id." })
  @IsUUID()
  bankAccountId: string;
}

export class SetEnclosureDto {
  @ApiProperty({ description: "دارای لف" })
  @IsBoolean()
  hasEnclosure: boolean;
}

/**
 * Approve and reject both resolve the request's open escalation, so they carry
 * the note the audit log requires — and the OTP the money path requires.
 */
export class EmDecisionDto {
  @ApiProperty({ description: "Written to the P2P audit log; required." })
  @IsString()
  @Length(1, 500)
  note: string;

  @ApiProperty({ description: "From POST /admin/operations/otp, scope `em.approve`." })
  @IsString()
  @Length(1, 64)
  challengeId: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  otp: string;
}
