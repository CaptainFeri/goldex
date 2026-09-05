import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { ReportFormatEnum, ReportStatusEnum, ReportTypeEnum } from "../enum/report.enums";

/** Which headline figure the list is filtered by, mirroring the panel's cards. */
export enum ReportKpiEnum {
  GENERATED = "generated",
  SCHEDULES = "schedules",
  DOWNLOADS = "downloads",
  DURATION = "duration",
}

export class GenerateReportDto {
  @ApiProperty({ enum: ReportTypeEnum, example: ReportTypeEnum.TRADES })
  @IsEnum(ReportTypeEnum)
  type: ReportTypeEnum;

  @ApiProperty({
    enum: ReportFormatEnum,
    example: ReportFormatEnum.XLSX,
    description: "PDF is not offered — see ReportFormatEnum for why",
  })
  @IsEnum(ReportFormatEnum)
  format: ReportFormatEnum;

  @ApiPropertyOptional({ example: "2026-08-01T00:00:00.000Z", description: "Inclusive. Omit for no lower bound." })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: "2026-09-01T00:00:00.000Z", description: "Inclusive. Omit for no upper bound." })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReportQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportKpiEnum, description: "Which of the panel's four cards is selected" })
  @IsOptional()
  @IsEnum(ReportKpiEnum)
  kpi?: ReportKpiEnum;

  @ApiPropertyOptional({ enum: ReportTypeEnum })
  @IsOptional()
  @IsEnum(ReportTypeEnum)
  type?: ReportTypeEnum;

  @ApiPropertyOptional({ example: "2026-08-01T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: "2026-09-01T00:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ReportJobDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ enum: ReportTypeEnum })
  type: ReportTypeEnum;

  @ApiProperty({ enum: ReportFormatEnum })
  format: ReportFormatEnum;

  @ApiProperty({ enum: ReportStatusEnum })
  status: ReportStatusEnum;

  @ApiPropertyOptional({ nullable: true })
  fromDate?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  toDate?: Date | null;

  @ApiProperty({ format: "uuid", description: "The admin who requested it" })
  createdBy: string;

  @ApiPropertyOptional({ nullable: true, description: "Rows written; null until it completes" })
  rowCount?: number | null;

  @ApiPropertyOptional({ nullable: true, example: "48213", description: "Bytes, as a string" })
  fileSize?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "How long generation took" })
  durationMs?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "When the artefact is purged" })
  artifactExpiresAt?: Date | null;

  @ApiProperty({
    example: false,
    description: "The file has been purged; the row remains as the audit record and download is gone",
  })
  artifactExpired: boolean;

  @ApiProperty({ example: 0, description: "How many times it has been downloaded" })
  downloadCount: number;

  @ApiPropertyOptional({ nullable: true, description: "Why it failed, when it did" })
  error?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "Set when a schedule produced it" })
  scheduleId?: string | null;

  @ApiProperty()
  createAt: Date;

  @ApiPropertyOptional({ nullable: true })
  completedAt?: Date | null;
}

export class ReportStatsDto {
  @ApiProperty({ example: 248, description: "Reports generated in the window the caller can see" })
  generated: number;

  @ApiProperty({ example: 12, description: "Schedules currently active" })
  activeSchedules: number;

  @ApiProperty({ example: 1840, description: "Downloads since the start of this month" })
  downloadsThisMonth: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 4200,
    description: "Mean generation time in milliseconds, over completed runs. Null when none have completed.",
  })
  averageDurationMs?: number | null;
}

export class ReportDownloadDto {
  @ApiProperty({
    example: "/api/v1/files/signed/eyJvIjoicmVwb3J0cy8uLi54bHN4In0.KT6JbmTEN",
    description:
      "Short-lived URL serving the artefact. Carries its own authorization and needs no bearer " +
      "token. Follow it as given; it expires in minutes and must not be persisted.",
  })
  url: string;

  @ApiProperty({ example: "trades-2026-09-05.xlsx" })
  fileName: string;
}

export class CreateReportScheduleDto {
  @ApiProperty({ example: "گزارش معاملات ماهانه" })
  @IsString()
  @Length(1, 120)
  name: string;

  @ApiProperty({ enum: ReportTypeEnum })
  @IsEnum(ReportTypeEnum)
  type: ReportTypeEnum;

  @ApiProperty({ enum: ReportFormatEnum })
  @IsEnum(ReportFormatEnum)
  format: ReportFormatEnum;

  @ApiProperty({ example: "0 3 * * 1", description: "Five-field cron, in the server's timezone" })
  @IsString()
  @Length(1, 120)
  cronExpression: string;

  @ApiPropertyOptional({
    example: 30,
    description: "How far back each run reaches. A rolling window, so a run does not re-export the same rows.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateReportScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ enum: ReportFormatEnum })
  @IsOptional()
  @IsEnum(ReportFormatEnum)
  format?: ReportFormatEnum;

  @ApiPropertyOptional({ example: "0 3 * * 1" })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  cronExpression?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReportScheduleDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid", description: "Whose schedule it is" })
  ownerId: string;

  @ApiProperty({ example: "گزارش معاملات ماهانه" })
  name: string;

  @ApiProperty({ enum: ReportTypeEnum })
  type: ReportTypeEnum;

  @ApiProperty({ enum: ReportFormatEnum })
  format: ReportFormatEnum;

  @ApiProperty({ example: "0 3 * * 1" })
  cronExpression: string;

  @ApiProperty({ example: 30 })
  windowDays: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastRunAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  nextRunAt?: Date | null;

  @ApiProperty()
  createAt: Date;
}
