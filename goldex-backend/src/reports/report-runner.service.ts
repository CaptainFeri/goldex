import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression, Interval } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, LessThanOrEqual, Repository } from "typeorm";
import { CronTime } from "cron";
import { MinioService } from "../minio/minio.service";
import { ReportBuilderService } from "./report-builder.service";
import { ReportJobEntity } from "./entity/report-job.entity";
import { ReportScheduleEntity } from "./entity/report-schedule.entity";
import { ReportStatusEnum } from "./enum/report.enums";
import { ARTIFACT_RETENTION_DAYS } from "./reports.service";

/** How often the sweep looks for queued work. */
const SWEEP_MS = 5_000;

/** How many jobs one sweep will take, so a backlog cannot monopolise the process. */
const BATCH = 3;

@Injectable()
export class ReportRunnerService {
  private readonly logger = new Logger(ReportRunnerService.name);
  private sweeping = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ReportJobEntity) private readonly jobs: Repository<ReportJobEntity>,
    @InjectRepository(ReportScheduleEntity) private readonly schedules: Repository<ReportScheduleEntity>,
    private readonly builder: ReportBuilderService,
    private readonly minio: MinioService,
  ) {}

  /**
   * Run queued reports.
   *
   * A sweep with `FOR UPDATE SKIP LOCKED` rather than a RabbitMQ consumer:
   * the claim is atomic in the database, so two instances running this at once
   * take different jobs instead of the same one twice, and there is no broker
   * topology to keep in step. The plan allowed for a queue; this gets the same
   * guarantee with one fewer moving part.
   *
   * `sweeping` keeps a slow batch from overlapping the next tick within one
   * process — the row lock protects across processes, this protects within.
   */
  @Interval(SWEEP_MS)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (let i = 0; i < BATCH; i++) {
        const job = await this.claim();
        if (!job) return;
        await this.run(job);
      }
    } catch (err) {
      this.logger.error(`Report sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  /** Take one pending job, atomically, or return null when there is none. */
  private async claim(): Promise<ReportJobEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const [candidate] = await manager
        .createQueryBuilder(ReportJobEntity, "job")
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .where("job.status = :status", { status: ReportStatusEnum.PENDING })
        .orderBy("job.created_at", "ASC")
        .limit(1)
        .getMany();

      if (!candidate) return null;

      candidate.status = ReportStatusEnum.RUNNING;
      candidate.startedAt = new Date();
      return manager.save(candidate);
    });
  }

  private async run(job: ReportJobEntity): Promise<void> {
    const started = job.startedAt?.getTime() ?? Date.now();
    try {
      const { stream, rowCount, contentType, extension } = await this.builder.build(
        job.type,
        job.format,
        job.fromDate ?? null,
        job.toDate ?? null,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const buffer = Buffer.concat(chunks);

      // Namespaced by job id, so two runs of the same report never collide and
      // the key cannot be guessed from the report's type and date alone.
      const objectName = `reports/${job.id}/${job.type}-${this.stamp()}.${extension}`;
      await this.minio.uploadFile(
        {
          objectName,
          stream: buffer,
          size: buffer.length,
          contentType,
          metadata: { reportJobId: job.id, createdBy: job.createdBy },
        },
        "report",
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + ARTIFACT_RETENTION_DAYS);

      job.status = ReportStatusEnum.COMPLETED;
      job.objectName = objectName;
      job.rowCount = rowCount;
      job.fileSize = String(buffer.length);
      job.artifactExpiresAt = expiresAt;
      job.completedAt = new Date();
      job.durationMs = Date.now() - started;
      job.error = null;
      await this.jobs.save(job);
      this.logger.log(`Report ${job.id} (${job.type}) completed: ${rowCount} rows`);
    } catch (err) {
      job.status = ReportStatusEnum.FAILED;
      job.completedAt = new Date();
      job.durationMs = Date.now() - started;
      // The message reaches an operator, so it says what went wrong without a
      // stack trace or a query in it.
      job.error = (err as Error).message?.slice(0, 500) ?? "unknown error";
      await this.jobs.save(job);
      this.logger.error(`Report ${job.id} failed: ${job.error}`);
    }
  }

  /**
   * Purge artefacts past their retention.
   *
   * The file goes; the row stays, flagged `artifactExpired`, because it is the
   * record of what was exported and by whom. Deleting the row instead would
   * erase the audit trail along with the data.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredArtifacts(): Promise<void> {
    const due = await this.jobs.find({
      where: { artifactExpired: false, artifactExpiresAt: LessThanOrEqual(new Date()) },
      take: 500,
    });

    for (const job of due) {
      if (job.objectName) {
        try {
          await this.minio.deleteFile(process.env.MINIO_BUCKET || "default", job.objectName);
        } catch (err) {
          // A file already gone is the desired end state, so the row is still
          // marked rather than retried forever.
          this.logger.warn(`Purging ${job.objectName} failed: ${(err as Error).message}`);
        }
      }
      job.artifactExpired = true;
      job.objectName = null;
      await this.jobs.save(job);
    }

    if (due.length > 0) this.logger.log(`Purged ${due.length} expired report artefacts`);
  }


  /**
   * Queue a run for every schedule that is due.
   *
   * Runs on the minute rather than registering a dynamic cron job per row:
   * schedules are edited through the API, and a registry of live cron jobs
   * would have to be kept in step with the table on every create, update,
   * delete and restart. Reading the table is one source of truth.
   *
   * A schedule with no `nextRunAt` yet is scheduled rather than fired, so
   * creating one never produces an immediate surprise export.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchSchedules(): Promise<void> {
    const active = await this.schedules.find({ where: { isActive: true } });
    const now = new Date();

    for (const schedule of active) {
      try {
        if (!schedule.nextRunAt) {
          schedule.nextRunAt = this.nextRun(schedule.cronExpression, now);
          await this.schedules.save(schedule);
          continue;
        }
        if (schedule.nextRunAt > now) continue;

        const to = new Date();
        const from = new Date(to.getTime() - schedule.windowDays * 24 * 3600 * 1000);

        await this.jobs.save(
          this.jobs.create({
            type: schedule.type,
            format: schedule.format,
            fromDate: from,
            toDate: to,
            status: ReportStatusEnum.PENDING,
            // The owner, not the process: a scheduled report is visible to
            // whoever set it up, under the same rule as one they asked for.
            createdBy: schedule.ownerId,
            scheduleId: schedule.id,
            artifactExpired: false,
          }),
        );

        schedule.lastRunAt = now;
        schedule.nextRunAt = this.nextRun(schedule.cronExpression, now);
        await this.schedules.save(schedule);
      } catch (err) {
        // One malformed cron expression must not stop the others dispatching.
        this.logger.error(
          `Schedule ${schedule.id} ("${schedule.cronExpression}") could not be dispatched: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Next fire time for a cron expression, or throw so the caller can log it. */
  private nextRun(expression: string, after: Date): Date {
    const time = new CronTime(expression);
    const next = time.getNextDateFrom(after);
    return next.toJSDate ? next.toJSDate() : new Date(next as unknown as string);
  }

  private stamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  }
}
