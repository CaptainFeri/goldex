import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import * as ExcelJS from "exceljs";
import { PassThrough, Readable } from "stream";
import { OrderEntity } from "../order/order.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { ReportFormatEnum, ReportTypeEnum } from "./enum/report.enums";

/** One column of an export. */
interface Column {
  header: string;
  key: string;
  width?: number;
}

interface Sheet {
  columns: Column[];
  rows: Record<string, unknown>[];
}

/**
 * How many rows one export may contain.
 *
 * A report is built in memory before it is written, so an unbounded date range
 * over `orders` would take the process down rather than produce a large file.
 * The cap is high enough for any real desk window and low enough to be safe;
 * a truncated export says so in the job's row count.
 */
export const MAX_REPORT_ROWS = 50_000;

/**
 * Turns a report type and a date window into a file.
 *
 * Money stays in the symbol's own units, as everywhere else — a rial column is
 * rial, and the panel converts on display. An export that quietly divided by
 * ten would be a spreadsheet nobody could reconcile against the database.
 */
@Injectable()
export class ReportBuilderService {
  constructor(
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(WithdrawEntity) private readonly withdraws: Repository<WithdrawEntity>,
    @InjectRepository(SystemLedgerEntity) private readonly ledger: Repository<SystemLedgerEntity>,
  ) {}

  async build(
    type: ReportTypeEnum,
    format: ReportFormatEnum,
    from: Date | null,
    to: Date | null,
  ): Promise<{ stream: Readable; rowCount: number; contentType: string; extension: string }> {
    const sheet = await this.collect(type, from, to);
    const { stream, contentType, extension } = await this.render(sheet, format, type);
    return { stream, rowCount: sheet.rows.length, contentType, extension };
  }

  /** A window with either end open still filters on the end that is set. */
  private range(from: Date | null, to: Date | null) {
    if (from && to) return Between(from, to);
    if (from) return MoreThanOrEqual(from);
    if (to) return LessThanOrEqual(to);
    return undefined;
  }

  private async collect(type: ReportTypeEnum, from: Date | null, to: Date | null): Promise<Sheet> {
    const createAt = this.range(from, to);
    const where = createAt ? { createAt } : {};
    const take = MAX_REPORT_ROWS;

    switch (type) {
      case ReportTypeEnum.TRADES: {
        const rows = await this.orders.find({
          where,
          relations: { pricePair: { baseSymbol: true, quoteSymbol: true }, user: true },
          order: { createAt: "DESC" },
          take,
        });
        return {
          columns: [
            { header: "کد سفارش", key: "orderCode", width: 18 },
            { header: "کاربر", key: "user", width: 24 },
            { header: "جفت‌ارز", key: "pair", width: 14 },
            { header: "سمت", key: "side", width: 8 },
            { header: "نوع", key: "orderType", width: 12 },
            { header: "مقدار", key: "quantity", width: 16 },
            { header: "اجرا شده", key: "executedQuantity", width: 16 },
            { header: "قیمت", key: "price", width: 18 },
            { header: "ارزش کل", key: "totalValue", width: 20 },
            { header: "وضعیت", key: "status", width: 14 },
            { header: "تاریخ", key: "createAt", width: 22 },
          ],
          rows: rows.map((o) => ({
            orderCode: o.orderCode ?? o.id,
            user: this.personName(o.user),
            pair: this.pairLabel(o.pricePair),
            side: o.side,
            orderType: o.orderType,
            quantity: this.decimal(o.quantity),
            executedQuantity: this.decimal(o.executedQuantity),
            price: this.decimal(o.price),
            totalValue: this.decimal(o.totalValue),
            status: o.status,
            createAt: this.iso(o.createAt),
          })),
        };
      }

      case ReportTypeEnum.USERS: {
        const rows = await this.users.find({
          where,
          order: { createAt: "DESC" },
          take,
        });
        return {
          columns: [
            { header: "شناسه", key: "id", width: 38 },
            { header: "نام", key: "firstName", width: 18 },
            { header: "نام خانوادگی", key: "lastName", width: 18 },
            { header: "موبایل", key: "phone", width: 16 },
            { header: "ایمیل", key: "email", width: 28 },
            { header: "نقش", key: "role", width: 12 },
            { header: "تاریخ ثبت‌نام", key: "createAt", width: 22 },
          ],
          // Deliberately no national id, KYC document reference, password hash
          // or 2FA state: an export leaves the platform's control the moment it
          // is downloaded, so it carries only what a desk report needs.
          rows: rows.map((u) => ({
            id: u.id,
            firstName: u.firstName ?? "",
            lastName: u.lastName ?? "",
            phone: u.phone ?? "",
            email: u.email ?? "",
            role: (u as any).role ?? "",
            createAt: this.iso(u.createAt),
          })),
        };
      }

      case ReportTypeEnum.WITHDRAWALS: {
        const rows = await this.withdraws.find({
          where,
          relations: { symbol: true, user: true },
          order: { createAt: "DESC" },
          take,
        });
        return {
          columns: [
            { header: "شناسه", key: "id", width: 38 },
            { header: "کاربر", key: "user", width: 24 },
            { header: "نماد", key: "symbol", width: 10 },
            { header: "مبلغ", key: "amount", width: 22 },
            { header: "نوع", key: "type", width: 14 },
            { header: "وضعیت", key: "status", width: 14 },
            { header: "تاریخ ثبت", key: "createAt", width: 22 },
            { header: "تاریخ تکمیل", key: "completedAt", width: 22 },
          ],
          rows: rows.map((w) => ({
            id: w.id,
            user: this.personName((w as any).user),
            symbol: (w as any).symbol?.slug ?? "",
            amount: this.decimal(w.amount),
            type: w.type,
            status: w.status,
            createAt: this.iso(w.createAt),
            completedAt: this.iso(w.completedAt),
          })),
        };
      }

      case ReportTypeEnum.FINANCIAL: {
        const createdAt = this.range(from, to);
        const rows = await this.ledger.find({
          where: createdAt ? { createdAt } : {},
          relations: { symbol: true },
          order: { createdAt: "DESC" },
          take,
        });
        return {
          columns: [
            { header: "شناسه", key: "id", width: 38 },
            { header: "نوع", key: "type", width: 20 },
            { header: "نماد", key: "symbol", width: 10 },
            { header: "مبلغ", key: "amount", width: 22 },
            { header: "تأمین‌کننده", key: "providerKey", width: 16 },
            { header: "توضیحات", key: "description", width: 36 },
            { header: "تاریخ", key: "createdAt", width: 22 },
          ],
          rows: rows.map((l) => ({
            id: l.id,
            type: l.type,
            symbol: (l as any).symbol?.slug ?? "",
            amount: this.decimal(l.amount),
            providerKey: (l as any).providerKey ?? "",
            description: (l as any).description ?? "",
            createdAt: this.iso((l as any).createdAt),
          })),
        };
      }
    }
  }

  private async render(sheet: Sheet, format: ReportFormatEnum, type: ReportTypeEnum) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(type);
    worksheet.columns = sheet.columns;
    worksheet.getRow(1).font = { bold: true };
    // RTL: the panels are Persian and so is every header here.
    worksheet.views = [{ rightToLeft: true }];
    worksheet.addRows(sheet.rows);

    const out = new PassThrough();
    if (format === ReportFormatEnum.CSV) {
      // A BOM, so Excel opens a UTF-8 CSV of Persian headers without mojibake.
      out.write("﻿");
      await workbook.csv.write(out);
      out.end();
      return { stream: out, contentType: "text/csv; charset=utf-8", extension: "csv" };
    }

    await workbook.xlsx.write(out);
    out.end();
    return {
      stream: out,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }

  private personName(person: { firstName?: string; lastName?: string; phone?: string } | null | undefined) {
    if (!person) return "";
    const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
    return name || person.phone || "";
  }

  private pairLabel(pair: any): string {
    if (!pair) return "";
    return `${pair.baseSymbol?.slug ?? "?"}/${pair.quoteSymbol?.slug ?? "?"}`;
  }

  /** Decimals come back from pg as strings; keep them exact rather than rounding. */
  private decimal(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
  }

  private iso(value: Date | null | undefined): string {
    return value ? new Date(value).toISOString() : "";
  }
}
