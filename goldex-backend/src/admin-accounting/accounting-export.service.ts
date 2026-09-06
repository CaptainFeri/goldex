import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { Response } from "express";
import { AccountingLedgerRowDto, VoucherDto } from "./dto/accounting.dto";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Spreadsheet exports for the accounting screens.
 *
 * Streamed straight to the response rather than queued like a report: these are
 * the rows already on screen, bounded by the same filters, so an operator
 * expects the file now and not a job to poll.
 *
 * Amounts are written in the symbol's own units, as everywhere else — an export
 * that quietly divided by ten would be a spreadsheet nobody could reconcile
 * against the database. The unit is its own column so the figure is never
 * ambiguous.
 */
@Injectable()
export class AccountingExportService {
  async streamLedger(rows: AccountingLedgerRowDto[], res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("ledger");
    ws.views = [{ rightToLeft: true }];
    ws.columns = [
      { header: "شناسه", key: "id", width: 38 },
      { header: "نوع", key: "type", width: 22 },
      { header: "شرح", key: "description", width: 40 },
      { header: "مبلغ", key: "amount", width: 22 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "تأمین‌کننده", key: "providerKey", width: 16 },
      { header: "تاریخ", key: "date", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRows(
      rows.map((r) => ({
        ...r,
        unit: r.unit ?? "",
        providerKey: r.providerKey ?? "",
        date: r.date ? new Date(r.date).toISOString() : "",
      })),
    );
    await this.send(wb, res, "accounting-ledger");
  }

  async streamVouchers(rows: VoucherDto[], res: Response): Promise<void> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("vouchers");
    ws.views = [{ rightToLeft: true }];
    ws.columns = [
      { header: "شماره سند", key: "voucherCode", width: 18 },
      { header: "نام مشتری", key: "customerName", width: 26 },
      { header: "شرح", key: "description", width: 36 },
      { header: "شرح تکمیلی", key: "extraDescription", width: 30 },
      { header: "نوع مشتری", key: "customerType", width: 12 },
      { header: "دسته", key: "categoryLabel", width: 18 },
      { header: "ماهیت", key: "sideLabel", width: 12 },
      { header: "مبلغ", key: "amount", width: 22 },
      { header: "واحد", key: "unit", width: 10 },
      { header: "وضعیت", key: "statusLabel", width: 16 },
      { header: "ثبت کننده", key: "createdByName", width: 24 },
      { header: "تاریخ سند", key: "documentDate", width: 24 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRows(
      rows.map((v) => ({
        ...v,
        extraDescription: v.extraDescription ?? "",
        unit: v.unit ?? "",
        createdByName: v.createdByName ?? "",
        documentDate: v.documentDate ? new Date(v.documentDate).toISOString() : "",
      })),
    );
    await this.send(wb, res, "accounting-vouchers");
  }

  private async send(wb: ExcelJS.Workbook, res: Response, name: string): Promise<void> {
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", XLSX_MIME);
    res.setHeader("Content-Disposition", `attachment; filename="${name}-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }
}
