import { Injectable } from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import { StatementRowDto } from "./dto/admin-shahin.dto";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ExportSection {
  accountNumber: string;
  bankName: string | null;
  rows: StatementRowDto[];
}

@Injectable()
export class ShahinExportService {
  /** One sheet per account, so a multi-account range stays readable. */
  async streamStatements(sections: ExportSection[], res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook();

    for (const section of sections) {
      // Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 chars.
      const name = `${section.bankName ?? "حساب"} ${section.accountNumber}`
        .replace(/[:\\/?*[\]]/g, "-")
        .slice(0, 31);
      const sheet = wb.addWorksheet(name);
      sheet.views = [{ rightToLeft: true }];
      sheet.columns = [
        { header: "تاریخ", key: "date", width: 22 },
        { header: "شرح", key: "description", width: 40 },
        { header: "بدهکار/بستانکار", key: "direction", width: 16 },
        { header: "مبلغ (ریال)", key: "amount", width: 20 },
        { header: "مانده (ریال)", key: "balance", width: 20 },
        { header: "شماره پیگیری", key: "trackNo", width: 24 },
      ];
      sheet.getRow(1).font = { bold: true };

      for (const r of section.rows) {
        sheet.addRow({
          date: r.date ?? "",
          description: r.description ?? "",
          direction: r.direction === "debit" ? "بدهکار" : r.direction === "credit" ? "بستانکار" : "",
          // Amounts stay in rial, as everywhere else on the wire; the header
          // says so rather than the workbook silently converting.
          amount: r.amount === null ? "" : Number(r.amount),
          balance: r.balance === null ? "" : Number(r.balance),
          trackNo: r.trackNo ?? "",
        });
      }
    }

    if (sections.length === 0) wb.addWorksheet("خالی");
    await this.send(wb, res, "shahin-statement");
  }

  private async send(wb: ExcelJS.Workbook, res: Response, name: string): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Content-Disposition", `attachment; filename="${name}-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}
