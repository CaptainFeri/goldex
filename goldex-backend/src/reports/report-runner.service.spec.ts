import { Readable } from "stream";
import { ReportRunnerService } from "./report-runner.service";
import { ReportFormatEnum, ReportStatusEnum, ReportTypeEnum } from "./enum/report.enums";

/**
 * The half of the runner that turns a built report into a stored artefact.
 *
 * The key it persists is the whole download path: `MinioService.uploadFile`
 * mints its own object name and ignores the one it is handed, so a runner that
 * saved the name it asked for left every job COMPLETED and every download
 * pointing at an object that was never written — the panel then saved the 404
 * body as the spreadsheet.
 */
describe("ReportRunnerService.run", () => {
  const MINTED = "report-3f8a1c9d4b6e2057-2026-09-05.xlsx";

  function build(over: { build?: jest.Mock; upload?: jest.Mock } = {}) {
    const jobs = { save: jest.fn(async (j) => j) };
    const builder = {
      build:
        over.build ??
        jest.fn().mockResolvedValue({
          stream: Readable.from(Buffer.from("spreadsheet-bytes")),
          rowCount: 42,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          extension: "xlsx",
        }),
    };
    const minio = {
      uploadFile: over.upload ?? jest.fn().mockResolvedValue({ name: MINTED, size: 17 }),
    };
    const runner = new ReportRunnerService(
      {} as any,
      jobs as any,
      { find: jest.fn() } as any,
      builder as any,
      minio as any,
    );
    return { runner, jobs, builder, minio };
  }

  const job = (over: Record<string, unknown> = {}) =>
    ({
      id: "job-1",
      type: ReportTypeEnum.TRADES,
      format: ReportFormatEnum.XLSX,
      createdBy: "admin-1",
      status: ReportStatusEnum.RUNNING,
      startedAt: new Date(),
      fromDate: null,
      toDate: null,
      ...over,
    }) as any;

  const run = (runner: ReportRunnerService, j: any) => (runner as any).run(j);

  it("persists the key storage minted, not the one it asked for", async () => {
    const { runner, jobs, minio } = build();
    const target = job();

    await run(runner, target);

    const requested = (minio.uploadFile as jest.Mock).mock.calls[0][0].objectName;
    expect(requested).not.toBe(MINTED);
    expect(jobs.save).toHaveBeenCalledWith(expect.objectContaining({ objectName: MINTED }));
  });

  it("uploads the rendered bytes under the report target with the builder's content type", async () => {
    const { runner, minio } = build();

    await run(runner, job());

    const [options, fileTarget] = (minio.uploadFile as jest.Mock).mock.calls[0];
    expect(fileTarget).toBe("report");
    expect(options.stream.toString()).toBe("spreadsheet-bytes");
    expect(options.size).toBe(Buffer.byteLength("spreadsheet-bytes"));
    expect(options.contentType).toContain("spreadsheetml");
    // The requested name only supplies the extension, so it must carry one.
    expect(options.objectName.endsWith(".xlsx")).toBe(true);
  });

  it("completes the job with the row count, size and a retention date", async () => {
    const { runner, jobs } = build();

    await run(runner, job());

    const saved = (jobs.save as jest.Mock).mock.calls[0][0];
    expect(saved.status).toBe(ReportStatusEnum.COMPLETED);
    expect(saved.rowCount).toBe(42);
    expect(saved.fileSize).toBe(String(Buffer.byteLength("spreadsheet-bytes")));
    expect(saved.artifactExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(saved.error).toBeNull();
  });

  it("fails the job rather than completing it with no artefact when the upload fails", async () => {
    // Without this the row reads COMPLETED and the operator only finds out when
    // the download arrives broken — which is exactly how this bug presented.
    const { runner, jobs } = build({
      upload: jest.fn().mockRejectedValue(new Error("bucket unreachable")),
    });

    await run(runner, job());

    const saved = (jobs.save as jest.Mock).mock.calls[0][0];
    expect(saved.status).toBe(ReportStatusEnum.FAILED);
    expect(saved.objectName).toBeUndefined();
    expect(saved.error).toBe("bucket unreachable");
  });

  it("fails the job when the report cannot be built", async () => {
    const { runner, jobs } = build({
      build: jest.fn().mockRejectedValue(new Error("query timed out")),
    });

    await run(runner, job());

    expect(jobs.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReportStatusEnum.FAILED, error: "query timed out" }),
    );
  });
});
