import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * One download of one report.
 *
 * Two jobs at once: exports are the easiest bulk-exfiltration path in the
 * panel, so every download is recorded against the admin who took it; and the
 * "downloads this month" figure is a count over these rows rather than a
 * counter that cannot say *when*.
 */
@Entity("report_downloads")
@Index(["reportJobId"])
@Index(["downloadedAt"])
export class ReportDownloadEntity extends myBaseEntity {
  @Column({ name: "report_job_id", type: "uuid" })
  reportJobId: string;

  @Column({ name: "admin_id", type: "uuid" })
  adminId: string;

  @Column({ name: "downloaded_at", type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  downloadedAt: Date;
}
