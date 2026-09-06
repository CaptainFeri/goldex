import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { ReportFormatEnum, ReportStatusEnum, ReportTypeEnum } from "../enum/report.enums";

/**
 * One generation run.
 *
 * The row outlives its artefact on purpose: once the file is purged at 90 days
 * the job stays as the audit record of what was exported, by whom and when,
 * with `artifactExpired` explaining why the download is gone.
 */
@Entity("report_jobs")
@Index(["createdBy", "createAt"])
@Index(["status"])
export class ReportJobEntity extends myBaseEntity {
  @Column({ type: "enum", enum: ReportTypeEnum })
  type: ReportTypeEnum;

  @Column({ type: "enum", enum: ReportFormatEnum })
  format: ReportFormatEnum;

  /** Inclusive lower bound of the window covered. Null means "from the start". */
  @Column({ name: "from_date", type: "timestamptz", nullable: true })
  fromDate?: Date | null;

  @Column({ name: "to_date", type: "timestamptz", nullable: true })
  toDate?: Date | null;

  @Column({ type: "enum", enum: ReportStatusEnum, default: ReportStatusEnum.PENDING })
  status: ReportStatusEnum;

  /**
   * The admin who asked for it — and the whole of the visibility rule.
   *
   * Everyone sees only their own; super admin sees all. Enforced identically
   * on list, detail and download.
   */
  @Column({ name: "created_by", type: "uuid" })
  createdBy: string;

  @ManyToOne(() => AdminEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator?: AdminEntity;

  /** Object key in storage. Null until the run completes, and after a purge. */
  @Column({ name: "object_name", type: "varchar", length: 512, nullable: true })
  objectName?: string | null;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: string | null;

  @Column({ name: "row_count", type: "int", nullable: true })
  rowCount?: number | null;

  @Column({ name: "artifact_expires_at", type: "timestamptz", nullable: true })
  artifactExpiresAt?: Date | null;

  /** The file is gone; the row remains as the audit record. */
  @Column({ name: "artifact_expired", type: "boolean", default: false })
  artifactExpired: boolean;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt?: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt?: Date | null;

  /** Feeds the "average generation time" figure without recomputing it. */
  @Column({ name: "duration_ms", type: "int", nullable: true })
  durationMs?: number | null;

  @Column({ type: "text", nullable: true })
  error?: string | null;

  /** Set when a schedule produced this run rather than a person. */
  @Column({ name: "schedule_id", type: "uuid", nullable: true })
  scheduleId?: string | null;
}
