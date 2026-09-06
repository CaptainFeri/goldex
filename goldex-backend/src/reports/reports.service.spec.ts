import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { MinioService } from "../minio/minio.service";
import { SignedFileUrlService } from "../shared/files/signed-file-url.service";
import { ReportsService, DOWNLOAD_URL_TTL_SECONDS } from "./reports.service";
import { ReportKpiEnum, ReportQueryDto } from "./dto/report.dto";
import { ReportFormatEnum, ReportStatusEnum, ReportTypeEnum } from "./enum/report.enums";

const OPERATOR = { adminId: "admin-1", role: AdminRole.FINANCE };
const OTHER_OPERATOR = { adminId: "admin-2", role: AdminRole.ADMIN };
const ROOT = { adminId: "admin-root", role: AdminRole.SUPER_ADMIN };

const completedJob = (over: Record<string, unknown> = {}) => ({
  id: "job-1",
  type: ReportTypeEnum.TRADES,
  format: ReportFormatEnum.XLSX,
  status: ReportStatusEnum.COMPLETED,
  createdBy: OPERATOR.adminId,
  objectName: "reports/job-1/trades-2026-09-05.xlsx",
  artifactExpired: false,
  createAt: new Date(),
  ...over,
});

function build(overrides: { job?: any } = {}) {
  const jobs = {
    findOne: jest.fn().mockResolvedValue(overrides.job ?? completedJob()),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: "job-new", createAt: new Date(), ...v })),
  };
  const schedules = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: "sched-1", createAt: new Date(), ...v })),
    softRemove: jest.fn(),
  };
  const downloads = {
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };
  const signer = { sign: jest.fn(() => "/api/v1/files/signed/tok.sig") } as unknown as SignedFileUrlService;
  const service = new ReportsService(
    jobs as any,
    schedules as any,
    downloads as any,
    {} as MinioService,
    signer,
  );
  return { service, jobs, schedules, downloads, signer };
}

describe("ReportsService visibility", () => {
  it("scopes an operator's list to their own reports", async () => {
    const { service, jobs } = build();
    await service.list(OPERATOR, new ReportQueryDto());
    expect(jobs.findAndCount.mock.calls[0][0].where).toMatchObject({ createdBy: OPERATOR.adminId });
  });

  it("does not scope a super admin's list", async () => {
    // The root role is the whole of "may see all reports" — deliberately not a
    // 23rd permission key, since the panel's matrix is fixed at 22.
    const { service, jobs } = build();
    await service.list(ROOT, new ReportQueryDto());
    expect(jobs.findAndCount.mock.calls[0][0].where).not.toHaveProperty("createdBy");
  });

  it("scopes detail lookups the same way as the list", async () => {
    const { service, jobs } = build();
    await service.findOne(OPERATOR, "job-1");
    expect(jobs.findOne.mock.calls[0][0].where).toMatchObject({ id: "job-1", createdBy: OPERATOR.adminId });
  });

  it("re-checks ownership on download rather than trusting the list", async () => {
    const { service, jobs } = build();
    await service.download(OPERATOR, "job-1");
    expect(jobs.findOne.mock.calls[0][0].where).toMatchObject({ createdBy: OPERATOR.adminId });
  });

  it("answers a non-owner with 404, never 403", async () => {
    // A 403 would confirm the report exists, turning a guessable UUID into a
    // way to learn what another desk exported.
    const { service, jobs } = build();
    jobs.findOne.mockResolvedValue(null);
    await expect(service.findOne(OTHER_OPERATOR, "job-1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.download(OTHER_OPERATOR, "job-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes schedules by owner, and not for the root role", async () => {
    const { service, schedules } = build();
    await service.listSchedules(OPERATOR);
    expect(schedules.find.mock.calls[0][0].where).toMatchObject({ ownerId: OPERATOR.adminId });
    await service.listSchedules(ROOT);
    expect(schedules.find.mock.calls[1][0].where).not.toHaveProperty("ownerId");
  });

  it("refuses to update or delete another operator's schedule", async () => {
    const { service, schedules } = build();
    schedules.findOne.mockResolvedValue(null);
    await expect(service.updateSchedule(OTHER_OPERATOR, "s-1", {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeSchedule(OTHER_OPERATOR, "s-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ReportsService download", () => {
  it("mints a short-lived URL for the artefact", async () => {
    const { service, signer } = build();
    const result = await service.download(OPERATOR, "job-1");
    expect(signer.sign).toHaveBeenCalledWith(
      "reports/job-1/trades-2026-09-05.xlsx",
      DOWNLOAD_URL_TTL_SECONDS,
    );
    expect(result.fileName).toBe("trades-2026-09-05.xlsx");
  });

  it("records every download, since an export is the widest data path in the panel", async () => {
    const { service, downloads } = build();
    await service.download(OPERATOR, "job-1");
    expect(downloads.save).toHaveBeenCalledWith(
      expect.objectContaining({ reportJobId: "job-1", adminId: OPERATOR.adminId }),
    );
  });

  it("refuses a job that has not finished", async () => {
    const { service } = build({ job: completedJob({ status: ReportStatusEnum.PENDING, objectName: null }) });
    await expect(service.download(OPERATOR, "job-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses a job whose artefact has been purged", async () => {
    // The row survives retention as the audit record, but the file is gone.
    const { service } = build({ job: completedJob({ artifactExpired: true }) });
    await expect(service.download(OPERATOR, "job-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReportsService.enqueue", () => {
  it("queues rather than generating inline", async () => {
    const { service, jobs } = build();
    const job = await service.enqueue(OPERATOR, {
      type: ReportTypeEnum.USERS,
      format: ReportFormatEnum.CSV,
    });
    expect(jobs.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReportStatusEnum.PENDING, createdBy: OPERATOR.adminId }),
    );
    expect(job.status).toBe(ReportStatusEnum.PENDING);
  });

  it("rejects a window that ends before it starts", async () => {
    const { service } = build();
    await expect(
      service.enqueue(OPERATOR, {
        type: ReportTypeEnum.USERS,
        format: ReportFormatEnum.CSV,
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReportsService.list kpi views", () => {
  it("shows only completed runs for the generated and duration cards", async () => {
    const { service, jobs } = build();
    for (const kpi of [ReportKpiEnum.GENERATED, ReportKpiEnum.DURATION]) {
      const query = new ReportQueryDto();
      query.kpi = kpi;
      await service.list(OPERATOR, query);
    }
    for (const call of jobs.findAndCount.mock.calls) {
      expect(call[0].where).toMatchObject({ status: ReportStatusEnum.COMPLETED });
    }
  });

  it("orders the duration card by generation time, not recency", async () => {
    const { service, jobs } = build();
    const query = new ReportQueryDto();
    query.kpi = ReportKpiEnum.DURATION;
    await service.list(OPERATOR, query);
    expect(jobs.findAndCount.mock.calls[0][0].order).toEqual({ durationMs: "ASC" });
  });

  it("returns an empty page for the downloads card when nothing has been downloaded", async () => {
    // Without this the empty id list would widen to "every report".
    const { service, jobs } = build();
    const query = new ReportQueryDto();
    query.kpi = ReportKpiEnum.DOWNLOADS;
    const page = await service.list(OPERATOR, query);
    expect(page.items).toEqual([]);
    expect(jobs.findAndCount).not.toHaveBeenCalled();
  });
});
