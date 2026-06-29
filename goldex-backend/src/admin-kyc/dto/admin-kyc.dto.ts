import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, IsArray, ArrayMinSize } from "class-validator";
import { FileTargetEnum } from "../../file/enum/file.target.enum";
import { KycDocumentStatus } from "../../user/entity/user.kyc.document.entity";

export class AdminApproveDocumentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  documentIds: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminRejectDocumentDto {
  @ApiProperty()
  @IsUUID()
  documentId: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminRejectMultipleDocumentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  documentIds: string[];

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetKycDocumentsQueryDto {
  @ApiProperty({ enum: KycDocumentStatus, required: false })
  @IsOptional()
  @IsEnum(KycDocumentStatus)
  status?: KycDocumentStatus;

  @ApiProperty({ enum: FileTargetEnum, required: false })
  @IsOptional()
  @IsEnum(FileTargetEnum)
  fileTarget?: FileTargetEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  page?: number;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  sortBy?: string;

  @ApiProperty({ enum: ["ASC", "DESC"], required: false })
  @IsOptional()
  sortOrder?: "ASC" | "DESC";
}

export class UserUploadStatsDto {
  totalUploads: number;
  maxAllowed: number;
  remaining: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  documents: {
    pending: KycDocumentSummaryDto[];
    approved: KycDocumentSummaryDto[];
    rejected: KycDocumentSummaryDto[];
  };
}

export class KycDocumentSummaryDto {
  id: string;
  fileTarget: FileTargetEnum;
  fileName: string;
  status: KycDocumentStatus;
  rejectionReason?: string;
  createdAt: Date;
}
