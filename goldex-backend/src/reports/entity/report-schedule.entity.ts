import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ReportFormatEnum, ReportTypeEnum } from "../enum/report.enums";

/** A standing instruction to generate a report on a cadence. */
@Entity("report_schedules")
@Index(["ownerId"])
export class ReportScheduleEntity extends myBaseEntity {
  /** Whose schedule it is — the same visibility rule as a job. */
  @Column({ name: "owner_id", type: "uuid" })
  ownerId: string;

  @Column({ type: "varchar", length: 120 })
  name: string;

  @Column({ type: "enum", enum: ReportTypeEnum })
  type: ReportTypeEnum;

  @Column({ type: "enum", enum: ReportFormatEnum })
  format: ReportFormatEnum;

  /** Five-field cron, evaluated in the server's timezone. */
  @Column({ name: "cron_expression", type: "varchar", length: 120 })
  cronExpression: string;

  /**
   * How far back each run reaches.
   *
   * A schedule covers a rolling window rather than fixed dates — "last 30
   * days, every Monday" — because fixed dates would re-export the same rows
   * forever.
   */
  @Column({ name: "window_days", type: "int", default: 30 })
  windowDays: number;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "last_run_at", type: "timestamptz", nullable: true })
  lastRunAt?: Date | null;

  @Column({ name: "next_run_at", type: "timestamptz", nullable: true })
  nextRunAt?: Date | null;
}
