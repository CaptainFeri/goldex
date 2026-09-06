import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { MinioService } from "../minio/minio.service";
import { PaginatedDto, paginate } from "../shared/dto/paginated.dto";
import { SignedFileUrlService } from "../shared/files/signed-file-url.service";
import {
  CreateReportScheduleDto,
  GenerateReportDto,
  ReportDownloadDto,
  ReportJobDto,
  ReportKpiEnum,
  ReportQueryDto,
  ReportScheduleDto,
  ReportStatsDto,
  UpdateReportScheduleDto,
} from "./dto/report.dto";
import { ReportDownloadEntity } from "./entity/report-download.entity";
import { ReportJobEntity } from "./entity/report-job.entity";
import { ReportScheduleEntity } from "./entity/report-schedule.entity";
import { ReportStatusEnum } from "./enum/report.enums";

/** How long a generated artefact is kept before the nightly purge removes it. */
export const ARTIFACT_RETENTION_DAYS = 90;

/**
 * A download URL lives just long enough to click.
 *
 * Shorter than the general file TTL: an export is the largest concentration of
 * data the panel hands out, so its URL should not survive being pasted
 * somewhere.
 */
export const DOWNLOAD_URL_TTL_SECONDS = 120;

/** Who is asking, and therefore what they may see. */
export interface ReportCaller {
  adminId: string;
  role: AdminRole;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ReportJobEntity) private readonly jobs: Repository<ReportJobEntity>,
    @InjectRepository(ReportScheduleEntity) private readonly schedules: Repository<ReportScheduleEntity>,
    @InjectRepository(ReportDownloadEntity) private readonly downloads: Repository<ReportDownloadEntity>,
    private readonly minio: MinioService,
    private readonly signer: SignedFileUrlService,
  ) {}

  /**
   * The visibility rule, in one place.
   *
   * Super admin sees everything; everyone else sees only what they created.
   * Deliberately **not** a 23rd permission key: the panel's matrix is fixed at
   * 22, so "may see all reports" is a property of the root role. The day a
   * finance lead needs it without full super-admin rights is the day to add
   * `reports_view_all` to the catalog — not before.
   */
  private ownerScope(caller: ReportCaller): { createdBy?: string } {
    return caller.role === AdminRole.SUPER_ADMIN ? {} : { createdBy: caller.adminId };
  }

  private scheduleScope(caller: ReportCaller): { ownerId?: string } {
    return caller.role === AdminRole.SUPER_ADMIN ? {} : { ownerId: caller.adminId };
  }

  /** A window with either end open still filters on the end that is set. */
  private range(from?: string, to?: string) {
    const start = from ? new Date(from) : null;
    const end = to ? new Date(to) : null;
    if (start && end) return Between(start, end);
    if (start) return MoreThanOrEqual(start);
    if (end) return LessThanOrEqual(end);
    return undefined;
  }

  // ── Jobs ────────────────────────────────────────────────────────────────

  /**
   * Queue a run and return immediately.
   *
   * The row is written `pending` and a sweep picks it up, so a report over a
   * year of orders never holds an HTTP request open.
   */
  async enqueue(caller: ReportCaller, dto: GenerateReportDto): Promise<ReportJobDto> {
    const from = dto.from ? new Date(dto.from) : null;
    const to = dto.to ? new Date(dto.to) : null;
    if (from && to && from > to) {
      throw new BadRequestException("REPORT.INVALID_RANGE");
    }

    const job = await this.jobs.save(
      this.jobs.create({
        type: dto.type,
        format: dto.format,
        fromDate: from,
        toDate: to,
        status: ReportStatusEnum.PENDING,
        createdBy: caller.adminId,
        artifactExpired: false,
      }),
    );
    return this.toJobDto(job, 0);
  }

  async list(caller: ReportCaller, query: ReportQueryDto): Promise<PaginatedDto<ReportJobDto>> {
    const createAt = this.range(query.from, query.to);
    const where: Record<string, unknown> = { ...this.ownerScope(caller) };
    if (createAt) where.createAt = createAt;
    if (query.type) where.type = query.type;

    // The panel's four cards are four views of the same list.
    if (query.kpi === ReportKpiEnum.GENERATED || query.kpi === ReportKpiEnum.DURATION) {
      where.status = ReportStatusEnum.COMPLETED;
    }
    if (query.kpi === ReportKpiEnum.DOWNLOADS) {
      const downloaded = await this.downloads.find({ select: { reportJobId: true } });
      const ids = [...new Set(downloaded.map((d) => d.reportJobId))];
      if (ids.length === 0) return paginate([], 0, query);
      where.id = In(ids);
    }

    const [items, total] = await this.jobs.findAndCount({
      where,
      // "By generation time" is the point of the duration card; everything else
      // reads newest-first.
      order: query.kpi === ReportKpiEnum.DURATION ? { durationMs: "ASC" } : { createAt: "DESC" },
      skip: query.skip,
      take: query.take,
    });

    const counts = await this.downloadCounts(items.map((j) => j.id));
    return paginate(
      items.map((j) => this.toJobDto(j, counts.get(j.id) ?? 0)),
      total,
      query,
    );
  }

  /**
   * One job, or a 404.
   *
   * A non-owner gets the same 404 as a caller naming an id that does not
   * exist: a 403 would confirm the report is real, which turns a guessable id
   * into a way to learn what another desk exported.
   */
  async findOne(caller: ReportCaller, id: string): Promise<ReportJobDto> {
    const job = await this.jobs.findOne({ where: { id, ...this.ownerScope(caller) } });
    if (!job) throw new NotFoundException("REPORT.NOT_FOUND");
    const counts = await this.downloadCounts([job.id]);
    return this.toJobDto(job, counts.get(job.id) ?? 0);
  }

  /**
   * Mint a download URL, and record that it was taken.
   *
   * Ownership is re-checked here rather than trusted from the list call — a
   * report id must not be a way to read another desk's export by guessing a
   * UUID.
   */
  async download(caller: ReportCaller, id: string): Promise<ReportDownloadDto> {
    const job = await this.jobs.findOne({ where: { id, ...this.ownerScope(caller) } });
    if (!job) throw new NotFoundException("REPORT.NOT_FOUND");

    if (job.status !== ReportStatusEnum.COMPLETED || !job.objectName) {
      throw new BadRequestException("REPORT.NOT_READY");
    }
    if (job.artifactExpired) {
      throw new BadRequestException("REPORT.ARTIFACT_EXPIRED");
    }

    await this.downloads.save(this.downloads.create({ reportJobId: job.id, adminId: caller.adminId }));

    return {
      url: this.signer.sign(job.objectName, DOWNLOAD_URL_TTL_SECONDS),
      fileName: job.objectName.split("/").pop() ?? job.objectName,
    };
  }

  async stats(caller: ReportCaller): Promise<ReportStatsDto> {
    const scope = this.ownerScope(caller);

    const [generated, activeSchedules, completed] = await Promise.all([
      this.jobs.count({ where: { ...scope, status: ReportStatusEnum.COMPLETED } }),
      this.schedules.count({ where: { ...this.scheduleScope(caller), isActive: true } }),
      this.jobs.find({
        where: { ...scope, status: ReportStatusEnum.COMPLETED },
        select: { id: true, durationMs: true },
      }),
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Scoped like everything else: an operator's download count is their own.
    const visibleIds = completed.map((j) => j.id);
    const downloadsThisMonth =
      caller.role === AdminRole.SUPER_ADMIN
        ? await this.downloads.count({ where: { downloadedAt: MoreThanOrEqual(startOfMonth) } })
        : visibleIds.length === 0
          ? 0
          : await this.downloads.count({
              where: { downloadedAt: MoreThanOrEqual(startOfMonth), reportJobId: In(visibleIds) },
            });

    const durations = completed.map((j) => j.durationMs).filter((d): d is number => typeof d === "number");
    const averageDurationMs =
      durations.length === 0
        ? null
        : Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);

    return { generated, activeSchedules, downloadsThisMonth, averageDurationMs };
  }

  // ── Schedules ───────────────────────────────────────────────────────────

  async listSchedules(caller: ReportCaller): Promise<ReportScheduleDto[]> {
    const rows = await this.schedules.find({
      where: this.scheduleScope(caller),
      order: { createAt: "DESC" },
    });
    return rows.map((s) => this.toScheduleDto(s));
  }

  async createSchedule(caller: ReportCaller, dto: CreateReportScheduleDto): Promise<ReportScheduleDto> {
    const saved = await this.schedules.save(
      this.schedules.create({
        ownerId: caller.adminId,
        name: dto.name,
        type: dto.type,
        format: dto.format,
        cronExpression: dto.cronExpression,
        windowDays: dto.windowDays ?? 30,
        isActive: dto.isActive ?? true,
      }),
    );
    return this.toScheduleDto(saved);
  }

  async updateSchedule(
    caller: ReportCaller,
    id: string,
    dto: UpdateReportScheduleDto,
  ): Promise<ReportScheduleDto> {
    const schedule = await this.schedules.findOne({ where: { id, ...this.scheduleScope(caller) } });
    if (!schedule) throw new NotFoundException("REPORT_SCHEDULE.NOT_FOUND");

    // The type is fixed at creation: changing it would make the run history
    // read as though the same schedule had always produced the new kind.
    Object.assign(schedule, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.format !== undefined && { format: dto.format }),
      ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
      ...(dto.windowDays !== undefined && { windowDays: dto.windowDays }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.toScheduleDto(await this.schedules.save(schedule));
  }

  async removeSchedule(caller: ReportCaller, id: string): Promise<void> {
    const schedule = await this.schedules.findOne({ where: { id, ...this.scheduleScope(caller) } });
    if (!schedule) throw new NotFoundException("REPORT_SCHEDULE.NOT_FOUND");
    // Soft delete: the jobs it produced still reference it.
    await this.schedules.softRemove(schedule);
  }

  // ── Mapping ─────────────────────────────────────────────────────────────

  private async downloadCounts(jobIds: string[]): Promise<Map<string, number>> {
    if (jobIds.length === 0) return new Map();
    const rows = await this.downloads
      .createQueryBuilder("d")
      .select("d.report_job_id", "jobId")
      .addSelect("COUNT(*)", "count")
      .where("d.report_job_id IN (:...jobIds)", { jobIds })
      .groupBy("d.report_job_id")
      .getRawMany<{ jobId: string; count: string }>();
    return new Map(rows.map((r) => [r.jobId, Number(r.count)]));
  }

  private toJobDto(job: ReportJobEntity, downloadCount: number): ReportJobDto {
    return {
      id: job.id,
      type: job.type,
      format: job.format,
      status: job.status,
      fromDate: job.fromDate ?? null,
      toDate: job.toDate ?? null,
      createdBy: job.createdBy,
      rowCount: job.rowCount ?? null,
      fileSize: job.fileSize ?? null,
      durationMs: job.durationMs ?? null,
      artifactExpiresAt: job.artifactExpiresAt ?? null,
      artifactExpired: job.artifactExpired,
      downloadCount,
      error: job.error ?? null,
      scheduleId: job.scheduleId ?? null,
      createAt: job.createAt,
      completedAt: job.completedAt ?? null,
    };
  }

  private toScheduleDto(s: ReportScheduleEntity): ReportScheduleDto {
    return {
      id: s.id,
      ownerId: s.ownerId,
      name: s.name,
      type: s.type,
      format: s.format,
      cronExpression: s.cronExpression,
      windowDays: s.windowDays,
      isActive: s.isActive,
      lastRunAt: s.lastRunAt ?? null,
      nextRunAt: s.nextRunAt ?? null,
      createAt: s.createAt,
    };
  }
}
