import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import * as ExcelJS from "exceljs";
import { FinanceLogEntity } from "./entity/finance-log.entity";
import { FinanceLogQueryDto } from "./dto/finance-log-query.dto";
import { CreditActionEnum } from "../credit/enum/credit-action.enum";
import { AdminEntity } from "../admin/entity/admin.entity";
import { UserEntity } from "../user/entity/user.entity";
import { CreditEntity } from "../credit/entity/credit.entity";
import { OrderEntity } from "../order/order.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";

const ACTION_LABELS: Record<string, string> = {
  CREDIT_CREATED: "ایجاد اعتبار",
  CREDIT_ACTIVATED: "فعال‌سازی اعتبار",
  CREDIT_SETTLED: "تسویه اعتبار",
  CREDIT_EXPIRED: "انقضای اعتبار",
  CREDIT_CANCELLED: "لغو اعتبار",
  WALLET_FROZEN: "مسدودسازی کیف‌پول",
  WALLET_UNFROZEN: "رفع مسدودیت کیف‌پول",
  BALANCE_INCREASED: "افزایش موجودی",
  BALANCE_FROZEN_FOR_CREDIT: "مسدود موجودی برای اعتبار",
  BALANCE_UNFROZEN_FOR_CREDIT: "رفع مسدود موجودی اعتبار",
  MATERIAL_FREEZE: "مسدودسازی موجودی کالا",
  LIQUIDATION: "نقد کردن موقعیت",
  ORDER_CANCELLED_MARGIN: "لغو سفارش (حاشیه)",
  EXPIRY_FREEZE_ALL: "مسدود کلی (انقضا)",
  USER_STATUS_CHANGED: "تغییر وضعیت کاربر",
  ALL_WALLETS_FROZEN: "مسدود همه کیف‌پول‌ها",
  REMINDER_SENT: "ارسال یادآوری",
};

function persianDate(d: Date): string {
  return d.toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

@Injectable()
export class FinanceLogService {
  private readonly logger = new Logger(FinanceLogService.name);

  constructor(
    @InjectRepository(FinanceLogEntity)
    private financeLogRepository: Repository<FinanceLogEntity>,
    @InjectRepository(AdminEntity)
    private adminRepository: Repository<AdminEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(CreditEntity)
    private creditRepository: Repository<CreditEntity>,
    @InjectRepository(OrderEntity)
    private orderRepository: Repository<OrderEntity>,
    @InjectRepository(WalletEntity)
    private walletRepository: Repository<WalletEntity>,
  ) {}

  async findAll(query: FinanceLogQueryDto): Promise<{ data: FinanceLogEntity[]; total: number }> {
    const qb = this.financeLogRepository.createQueryBuilder("log")
      .leftJoinAndSelect("log.admin", "admin");

    if (query.startDate) {
      qb.andWhere("log.actionTime >= :startDate", { startDate: new Date(query.startDate) });
    }
    if (query.endDate) {
      qb.andWhere("log.actionTime <= :endDate", { endDate: new Date(query.endDate) });
    }
    if (query.actionType) {
      qb.andWhere("log.actionType = :actionType", { actionType: query.actionType });
    }
    if (query.adminId) {
      qb.andWhere("log.adminId = :adminId", { adminId: query.adminId });
    }
    if (query.userId) {
      qb.andWhere("log.userId = :userId", { userId: query.userId });
    }

    const [data, total] = await qb
      .orderBy("log.actionTime", "DESC")
      .getManyAndCount();

    return { data, total };
  }

  async exportToExcel(query: FinanceLogQueryDto): Promise<Buffer> {
    const { data } = await this.findAll(query);
    const enrichedData = await this.enrichLogs(data);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Goldex";
    workbook.created = new Date();

    const ws = workbook.addWorksheet("finance-logs", {
      views: [{ rightToLeft: true }],
    });

    const HEADER_FONT = { name: "Tahoma", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    const HEADER_FILL: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E79" },
    };
    const BODY_FONT = { name: "Tahoma", size: 10 };
    const TITLE_FONT = { name: "Tahoma", size: 16, bold: true, color: { argb: "FF1F4E79" } };
    const SUBTITLE_FONT = { name: "Tahoma", size: 10, color: { argb: "FF666666" } };
    const SUMMARY_LABEL_FONT = { name: "Tahoma", size: 11, bold: true, color: { argb: "FF333333" } };
    const SUMMARY_VALUE_FONT = { name: "Tahoma", size: 11, color: { argb: "FF1F4E79" } };

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FF999999" } },
      left: { style: "thin", color: { argb: "FF999999" } },
      bottom: { style: "thin", color: { argb: "FF999999" } },
      right: { style: "thin", color: { argb: "FF999999" } },
    };

    // ── Title ──
    ws.mergeCells("A2:I2");
    const titleCell = ws.getCell("A2");
    titleCell.value = "گزارش تراکنش‌های مالی";
    titleCell.font = TITLE_FONT;
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 36;

    // ── Date range subtitle ──
    ws.mergeCells("A3:I3");
    const subtitleCell = ws.getCell("A3");
    const from = query.startDate ? persianDate(new Date(query.startDate)) : "—";
    const to = query.endDate ? persianDate(new Date(query.endDate)) : "—";
    subtitleCell.value = `بازه: ${from} تا ${to}`;
    subtitleCell.font = SUBTITLE_FONT;
    subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(3).height = 22;

    // ── Summary section ──
    ws.mergeCells("A5:B5");
    const summaryTitle = ws.getCell("A5");
    summaryTitle.value = "خلاصه گزارش";
    summaryTitle.font = { name: "Tahoma", size: 12, bold: true, color: { argb: "FF1F4E79" } };
    ws.getRow(5).height = 24;

    const summaryLabels = [
      ["تعداد کل تراکنش‌ها", String(data.length)],
    ];

    const actionCounts: Record<string, number> = {};
    for (const item of enrichedData) {
      const label = ACTION_LABELS[item.actionType] || item.actionType;
      actionCounts[label] = (actionCounts[label] || 0) + 1;
    }

    let summaryRow = 6;
    for (const [label, value] of summaryLabels) {
      const lblCell = ws.getCell(`A${summaryRow}`);
      lblCell.value = label;
      lblCell.font = SUMMARY_LABEL_FONT;
      lblCell.alignment = { horizontal: "right", vertical: "middle" };
      lblCell.border = thinBorder;

      const valCell = ws.getCell(`B${summaryRow}`);
      valCell.value = value;
      valCell.font = SUMMARY_VALUE_FONT;
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.border = thinBorder;
      summaryRow++;
    }

    // Action type breakdown
    ws.mergeCells(`A${summaryRow}:B${summaryRow}`);
    const breakdownTitle = ws.getCell(`A${summaryRow}`);
    breakdownTitle.value = "تعداد به تفکیک نوع اقدام";
    breakdownTitle.font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FF1F4E79" } };
    summaryRow++;

    for (const [action, count] of Object.entries(actionCounts).sort((a, b) => b[1] - a[1])) {
      const lblCell = ws.getCell(`A${summaryRow}`);
      lblCell.value = action;
      lblCell.font = BODY_FONT;
      lblCell.alignment = { horizontal: "right", vertical: "middle" };
      lblCell.border = thinBorder;

      const valCell = ws.getCell(`B${summaryRow}`);
      valCell.value = count;
      valCell.font = BODY_FONT;
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.border = thinBorder;
      summaryRow++;
    }

    // ── Blank row before table ──
    summaryRow++;

    // ── Data table ──
    const columns: { header: string; key: string; width: number }[] = [
      { header: "ردیف", key: "row", width: 6 },
      { header: "تاریخ و زمان", key: "time", width: 26 },
      { header: "نوع اقدام", key: "action", width: 22 },
      { header: "مدیر", key: "admin", width: 16 },
      { header: "کاربر", key: "user", width: 16 },
      { header: "کد اعتبار", key: "credit", width: 20 },
      { header: "شناسه کیف پول", key: "wallet", width: 20 },
      { header: "کد سفارش", key: "order", width: 20 },
      { header: "توضیحات", key: "description", width: 36 },
    ];

    const headerRowNumber = summaryRow;
    ws.getRow(headerRowNumber).height = 26;

    for (let ci = 0; ci < columns.length; ci++) {
      const cell = ws.getCell(`${String.fromCharCode(65 + ci)}${headerRowNumber}`);
      cell.value = columns[ci].header;
      cell.font = HEADER_FONT;
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    }

    const EVEN_FILL: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F7FB" },
    };

    for (let ri = 0; ri < enrichedData.length; ri++) {
      const item = enrichedData[ri];
      const rowNumber = headerRowNumber + 1 + ri;
      const row = ws.getRow(rowNumber);
      row.height = 22;

      const values = [
        ri + 1,
        persianDate(new Date(item.actionTime)),
        ACTION_LABELS[item.actionType] || item.actionType,
        item.adminPhone || item.adminEmail || item.adminId || "سیستم",
        item.userName || item.userId || "—",
        item.creditCode || "—",
        item.walletId || "—",
        item.orderCode || "—",
        item.description || "—",
      ];

      for (let ci = 0; ci < values.length; ci++) {
        const cell = row.getCell(ci + 1);
        cell.value = values[ci];
        cell.font = BODY_FONT;
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.border = thinBorder;
        if (ri % 2 === 1) {
          cell.fill = EVEN_FILL;
        }
      }

      // RTL alignment for text columns
      const textCols = [2, 3, 4, 5, 6, 7, 8, 9];
      for (const ci of textCols) {
        const cell = row.getCell(ci);
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      }
      // Center the row number
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    }

    // Column widths
    for (let ci = 0; ci < columns.length; ci++) {
      ws.getColumn(ci + 1).width = columns[ci].width;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async enrichLogs(logs: FinanceLogEntity[]): Promise<any[]> {
    const adminIds = [...new Set(logs.map((l) => l.adminId).filter(Boolean))] as string[];
    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
    const creditIds = [...new Set(logs.map((l) => l.creditId).filter(Boolean))] as string[];
    const orderIds = [...new Set(logs.map((l) => l.orderId).filter(Boolean))] as string[];

    let admins: AdminEntity[] = [];
    let users: UserEntity[] = [];
    let credits: CreditEntity[] = [];
    let orders: OrderEntity[] = [];

    if (adminIds.length > 0) {
      admins = await this.adminRepository.find({ where: { id: In(adminIds) } as any });
    }
    if (userIds.length > 0) {
      users = await this.userRepository.find({ where: { id: In(userIds) } as any });
    }
    if (creditIds.length > 0) {
      credits = await this.creditRepository.find({ where: { id: In(creditIds) } as any });
    }
    if (orderIds.length > 0) {
      orders = await this.orderRepository.find({ where: { id: In(orderIds) } as any });
    }

    const adminMap = new Map<string, AdminEntity>(admins.map((a) => [a.id, a]));
    const userMap = new Map<string, UserEntity>(users.map((u) => [u.id, u]));
    const creditMap = new Map<string, CreditEntity>(credits.map((c) => [c.id, c]));
    const orderMap = new Map<string, OrderEntity>(orders.map((o) => [o.id, o]));

    return logs.map((log) => ({
      ...log,
      adminPhone: adminMap.get(log.adminId)?.phone || "",
      adminEmail: adminMap.get(log.adminId)?.email || "",
      userName: userMap.get(log.userId) ? `${userMap.get(log.userId).firstName} ${userMap.get(log.userId).lastName}` : "",
      creditCode: creditMap.get(log.creditId)?.creditCode || "",
      orderCode: orderMap.get(log.orderId)?.orderCode || "",
    }));
  }
}
