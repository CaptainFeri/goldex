import * as ExcelJS from "exceljs";
import { Readable } from "stream";
import { ReportBuilderService } from "./report-builder.service";
import { ReportFormatEnum, ReportTypeEnum } from "./enum/report.enums";

/**
 * The rendering half of the builder, which has no database in it.
 *
 * The row counts matter: rendering used to write into a PassThrough the caller
 * had not started reading, so anything past its 16KB buffer stalled — a CSV of a
 * few hundred rows hung the job for good while a ten-row one passed. Every case
 * here therefore runs at a size well past that buffer as well as a small one.
 */
describe("ReportBuilderService rendering", () => {
  const builder = new ReportBuilderService(
    null as any,
    null as any,
    null as any,
    null as any,
  );

  const sheet = (rowCount: number) => ({
    columns: [
      { header: "کد سفارش", key: "a", width: 18 },
      { header: "کاربر", key: "b", width: 24 },
      { header: "مبلغ", key: "c", width: 22 },
    ],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      a: `ORD-${i}`,
      b: `کاربر شماره ${i}`,
      c: String(123456789 + i),
    })),
  });

  const render = (rowCount: number, format: ReportFormatEnum) =>
    (builder as any).render(sheet(rowCount), format, ReportTypeEnum.TRADES) as Promise<{
      stream: Readable;
      contentType: string;
      extension: string;
    }>;

  async function drain(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  describe.each([10, 5000])("with %i rows", (rowCount) => {
    it("renders an xlsx a spreadsheet reader can open, with every row", async () => {
      const { stream, extension, contentType } = await render(rowCount, ReportFormatEnum.XLSX);
      const buffer = await drain(stream);

      expect(extension).toBe("xlsx");
      expect(contentType).toContain("spreadsheetml");
      // A zip local-file header — the file is not an error body saved as .xlsx.
      expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      // Header row plus the data rows.
      expect(workbook.worksheets[0].rowCount).toBe(rowCount + 1);
    });

    it("renders a csv with the BOM, the Persian header and every row", async () => {
      const { stream, extension, contentType } = await render(rowCount, ReportFormatEnum.CSV);
      const buffer = await drain(stream);

      expect(extension).toBe("csv");
      expect(contentType).toContain("charset=utf-8");
      // Without the BOM, Excel opens Persian headers as mojibake.
      expect(buffer.subarray(0, 3).toString("hex")).toBe("efbbbf");

      const text = buffer.toString("utf8");
      expect(text).toContain("کد سفارش");
      expect(text.trimEnd().split("\n")).toHaveLength(rowCount + 1);
    });
  });

  it("reports the row count it actually wrote", async () => {
    const sheetRows = sheet(7).rows.length;
    const { stream } = await render(7, ReportFormatEnum.CSV);
    const text = (await drain(stream)).toString("utf8");
    expect(text.trimEnd().split("\n")).toHaveLength(sheetRows + 1);
  });

  it("renders an empty report as a header-only file rather than failing", async () => {
    const { stream } = await render(0, ReportFormatEnum.XLSX);
    const buffer = await drain(stream);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    expect(workbook.worksheets[0].rowCount).toBe(1);
  });
});
