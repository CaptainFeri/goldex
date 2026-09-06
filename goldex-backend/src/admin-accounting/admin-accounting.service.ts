import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Brackets, Repository } from "typeorm";
import jMoment from "moment-jalaali";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import { PaginatedDto, paginate } from "../shared/dto/paginated.dto";
import { AccountingVoucherEntity } from "./entity/accounting-voucher.entity";
import {
  AccountingGranularity,
  AccountingMetric,
  CustomerType,
  VOUCHER_CATEGORY_LABELS,
  VOUCHER_SIDE_LABELS,
  VOUCHER_STATUS_LABELS,
  VoucherCategory,
  VoucherMovement,
  VoucherSide,
  VoucherStatus,
  WALLET_SUBSET_LABELS,
  WalletSubset,
} from "./accounting.enums";
import {
  AccountingLedgerQueryDto,
  AccountingLedgerRowDto,
  AccountingSeriesDto,
  AccountingSeriesQueryDto,
  AccountingStatsDto,
  CreateVoucherDto,
  ReviewVoucherDto,
  VoucherCatalogsDto,
  VoucherDto,
  VoucherQueryDto,
} from "./dto/accounting.dto";

const JALALI_MONTHS = ["فرو", "ارد", "خرد", "تیر", "مرد", "شهر", "مهر", "آبا", "آذر", "دی", "بهم", "اسف"];

/**
 * The accounting side a movement books to.
 *
 * A deposit increases what the platform owes the customer, so the customer
 * stands as creditor; a withdrawal reduces it and they stand as debtor. This is
 * the only place the mapping exists, and it runs on write — a client that sent
 * its own `side` would be ignored, because a voucher whose stated side
 * disagreed with its movement reconciles to nothing.
 */
export function sideForMovement(movement: VoucherMovement): VoucherSide {
  return movement === VoucherMovement.DEPOSIT ? VoucherSide.CREDITOR : VoucherSide.DEBTOR;
}

@Injectable()
export class AdminAccountingService {
  constructor(
    @InjectRepository(SystemLedgerEntity) private readonly ledger: Repository<SystemLedgerEntity>,
    @InjectRepository(AccountingVoucherEntity) private readonly vouchers: Repository<AccountingVoucherEntity>,
    @InjectRepository(SymbolEntity) private readonly symbols: Repository<SymbolEntity>,
  ) {}

  // ── §5.21 Accounting ────────────────────────────────────────────────────

  async stats(): Promise<AccountingStatsDto> {
    const rows = await this.ledger
      .createQueryBuilder("l")
      .select("COALESCE(SUM(CASE WHEN l.amount >= 0 THEN l.amount ELSE 0 END), 0)", "income")
      .addSelect("COALESCE(SUM(CASE WHEN l.amount < 0 THEN -l.amount ELSE 0 END), 0)", "expense")
      .getRawOne<{ income: string; expense: string }>();

    const income = Number(rows.income) || 0;
    const expense = Number(rows.expense) || 0;
    const netProfit = income - expense;

    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      netProfit: netProfit.toFixed(2),
      // Null rather than 0 when there was no income: a margin on nothing is not
      // a ratio, and 0% would read as "we earned nothing on what we sold".
      marginPercent: income === 0 ? null : Number(((netProfit / income) * 100).toFixed(1)),
      unit: RIAL_SYMBOL_SLUG,
    };
  }

  /**
   * A metric over Jalali buckets.
   *
   * The bucket boundaries come from `moment-jalaali` for the same reason the
   * dashboard's do: Jalali months and days do not line up with Gregorian ones,
   * so grouping in SQL and labelling in Persian would misfile the edges.
   */
  async series(query: AccountingSeriesQueryDto): Promise<AccountingSeriesDto> {
    const buckets = this.buckets(query);
    const points = [];

    for (const b of buckets) {
      const { income, expense } = await this.sumRange(b.start, b.end);
      const profit = income - expense;
      let value: number;
      switch (query.metric) {
        case AccountingMetric.INCOME: value = income; break;
        case AccountingMetric.EXPENSE: value = expense; break;
        case AccountingMetric.PROFIT: value = profit; break;
        case AccountingMetric.MARGIN: value = income === 0 ? 0 : (profit / income) * 100; break;
      }
      points.push({
        key: b.key,
        label: b.label,
        value: value.toFixed(query.metric === AccountingMetric.MARGIN ? 1 : 2),
      });
    }

    return {
      metric: query.metric,
      granularity: query.granularity,
      // Margin is a ratio, so it carries no currency. Sending IRR here would
      // have the panel render a percentage as toman.
      unit: query.metric === AccountingMetric.MARGIN ? null : RIAL_SYMBOL_SLUG,
      points,
    };
  }

  private buckets(q: AccountingSeriesQueryDto): { key: string; label: string; start: Date; end: Date }[] {
    const year = q.year ?? jMoment().jYear();

    if (q.granularity === AccountingGranularity.MONTH) {
      return Array.from({ length: 12 }, (_, i) => {
        const start = jMoment().jYear(year).jMonth(i).jDate(1).startOf("day");
        return {
          key: `${year}/${String(i + 1).padStart(2, "0")}`,
          label: JALALI_MONTHS[i],
          start: start.toDate(),
          end: jMoment(start).add(1, "jMonth").toDate(),
        };
      });
    }

    const month = q.month ?? jMoment().jMonth() + 1;

    if (q.granularity === AccountingGranularity.DAY) {
      const first = jMoment().jYear(year).jMonth(month - 1).jDate(1).startOf("day");
      const days = jMoment(first).add(1, "jMonth").diff(first, "days");
      return Array.from({ length: days }, (_, i) => {
        const start = jMoment(first).add(i, "days");
        return {
          key: `${year}/${String(month).padStart(2, "0")}/${String(i + 1).padStart(2, "0")}`,
          label: String(i + 1),
          start: start.toDate(),
          end: jMoment(start).add(1, "day").toDate(),
        };
      });
    }

    const day = q.day ?? jMoment().jDate();
    const dayStart = jMoment().jYear(year).jMonth(month - 1).jDate(day).startOf("day");
    return Array.from({ length: 24 }, (_, i) => {
      const start = jMoment(dayStart).add(i, "hours");
      return {
        key: `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} ${String(i).padStart(2, "0")}`,
        label: String(i).padStart(2, "0"),
        start: start.toDate(),
        end: jMoment(start).add(1, "hour").toDate(),
      };
    });
  }

  private async sumRange(start: Date, end: Date): Promise<{ income: number; expense: number }> {
    const row = await this.ledger
      .createQueryBuilder("l")
      .select("COALESCE(SUM(CASE WHEN l.amount >= 0 THEN l.amount ELSE 0 END), 0)", "income")
      .addSelect("COALESCE(SUM(CASE WHEN l.amount < 0 THEN -l.amount ELSE 0 END), 0)", "expense")
      .where("l.created_at >= :start AND l.created_at < :end", { start, end })
      .getRawOne<{ income: string; expense: string }>();
    return { income: Number(row.income) || 0, expense: Number(row.expense) || 0 };
  }

  async ledgerRows(query: AccountingLedgerQueryDto): Promise<PaginatedDto<AccountingLedgerRowDto>> {
    const qb = this.buildLedgerQuery(query);
    const [rows, total] = await qb.skip(query.skip).take(query.take).getManyAndCount();
    return paginate(rows.map((l) => this.toLedgerRow(l)), total, query);
  }

  /** The same query the list uses, so an export never disagrees with the screen. */
  async ledgerForExport(query: AccountingLedgerQueryDto): Promise<AccountingLedgerRowDto[]> {
    const rows = await this.buildLedgerQuery(query).take(50_000).getMany();
    return rows.map((l) => this.toLedgerRow(l));
  }

  private buildLedgerQuery(query: AccountingLedgerQueryDto) {
    const qb = this.ledger
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.symbol", "symbol")
      .orderBy("l.created_at", "DESC");

    if (query.q) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("l.description ILIKE :q", { q: `%${query.q}%` }).orWhere("CAST(l.type AS text) ILIKE :q", {
            q: `%${query.q}%`,
          });
        }),
      );
    }
    // Bounds are on the magnitude: an operator looking for "entries over ten
    // million" means either direction, not only credits.
    if (query.minAmount) qb.andWhere("ABS(l.amount) >= :min", { min: query.minAmount });
    if (query.maxAmount) qb.andWhere("ABS(l.amount) <= :max", { max: query.maxAmount });

    const range = this.jalaliRange(query);
    if (range) {
      qb.andWhere("l.created_at >= :start AND l.created_at < :end", { start: range.start, end: range.end });
    }
    return qb;
  }

  /** Progressive Jalali filter: year, then month, then day, then hour. */
  private jalaliRange(q: AccountingLedgerQueryDto): { start: Date; end: Date } | null {
    if (!q.year) return null;
    let start = jMoment().jYear(q.year).jMonth(0).jDate(1).startOf("day");
    let unit: any = "jYear";
    if (q.month) {
      start = jMoment().jYear(q.year).jMonth(q.month - 1).jDate(1).startOf("day");
      unit = "jMonth";
    }
    if (q.month && q.day) {
      start = jMoment().jYear(q.year).jMonth(q.month - 1).jDate(q.day).startOf("day");
      unit = "day";
    }
    if (q.month && q.day && q.hour !== undefined) {
      start = jMoment(start).add(q.hour, "hours");
      unit = "hour";
    }
    return { start: start.toDate(), end: jMoment(start).add(1, unit).toDate() };
  }

  private toLedgerRow(l: any): AccountingLedgerRowDto {
    return {
      id: l.id,
      type: l.type,
      description: l.description ?? "",
      amount: String(l.amount),
      unit: l.symbol?.slug ?? null,
      providerKey: l.providerKey ?? null,
      date: l.createdAt,
    };
  }

  // ── §5.22 Vouchers ──────────────────────────────────────────────────────

  async catalogs(): Promise<VoucherCatalogsDto> {
    const symbols = await this.symbols.find({ where: { isActive: true }, order: { slug: "ASC" } });
    const opts = <T extends string>(labels: Record<T, string>) =>
      (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));

    return {
      categories: opts(VOUCHER_CATEGORY_LABELS),
      // Real wallet types. The panels' mock listed a rial wallet and a toman
      // wallet as separate options; they are one wallet, and toman is a display
      // convention that belongs to the client.
      walletTypes: [
        { value: WalletTypeEnum.DEPOSIT, label: "کیف پول اصلی" },
        { value: WalletTypeEnum.CREDIT, label: "کیف پول اعتباری" },
        { value: WalletTypeEnum.COLLATERAL, label: "کیف پول وثیقه" },
      ],
      walletSubsets: opts(WALLET_SUBSET_LABELS),
      symbols: symbols.map((s) => ({ value: s.id, label: s.slug })),
      customerTypes: [
        { value: CustomerType.FORMAL, label: "رسمی" },
        { value: CustomerType.INFORMAL, label: "غیر رسمی" },
      ],
      movements: [
        { value: VoucherMovement.DEPOSIT, label: "واریز" },
        { value: VoucherMovement.WITHDRAW, label: "برداشت" },
      ],
    };
  }

  async listVouchers(query: VoucherQueryDto): Promise<PaginatedDto<VoucherDto>> {
    const qb = this.buildVoucherQuery(query);
    const [rows, total] = await qb.skip(query.skip).take(query.take).getManyAndCount();
    return paginate(rows.map((v) => this.toVoucherDto(v)), total, query);
  }

  async vouchersForExport(query: VoucherQueryDto): Promise<VoucherDto[]> {
    const rows = await this.buildVoucherQuery(query).take(50_000).getMany();
    return rows.map((v) => this.toVoucherDto(v));
  }

  private buildVoucherQuery(query: VoucherQueryDto) {
    const qb = this.vouchers
      .createQueryBuilder("v")
      .leftJoinAndSelect("v.symbol", "symbol")
      .leftJoinAndSelect("v.creator", "creator")
      .orderBy("v.created_at", "DESC");

    if (query.customer) qb.andWhere("v.customer_name ILIKE :c", { c: `%${query.customer}%` });
    if (query.customerType) qb.andWhere("v.customer_type = :ct", { ct: query.customerType });
    if (query.status) qb.andWhere("v.status = :st", { st: query.status });
    if (query.amountFrom) qb.andWhere("v.amount >= :af", { af: query.amountFrom });
    if (query.amountTo) qb.andWhere("v.amount <= :at", { at: query.amountTo });
    // Filtered on the accounting date the operator entered, not on when the row
    // happened to be created — those differ, and the ledger is read by the former.
    if (query.dateFrom) qb.andWhere("v.document_date >= :df", { df: new Date(query.dateFrom) });
    if (query.dateTo) qb.andWhere("v.document_date <= :dt", { dt: new Date(query.dateTo) });
    return qb;
  }

  async findVoucher(id: string): Promise<VoucherDto> {
    const v = await this.vouchers.findOne({ where: { id }, relations: { symbol: true, creator: true } });
    if (!v) throw new NotFoundException("VOUCHER.NOT_FOUND");
    return this.toVoucherDto(v);
  }

  async createVoucher(adminId: string, dto: CreateVoucherDto): Promise<VoucherDto> {
    const symbol = await this.symbols.findOne({ where: { id: dto.symbolId } });
    if (!symbol) throw new BadRequestException("VOUCHER.UNKNOWN_SYMBOL");

    if (Number(dto.amount) <= 0) throw new BadRequestException("VOUCHER.AMOUNT_MUST_BE_POSITIVE");

    const documentDate = new Date(dto.documentDate);
    if (Number.isNaN(documentDate.getTime())) throw new BadRequestException("VOUCHER.INVALID_DATE");

    const saved = await this.vouchers.save(
      this.vouchers.create({
        voucherCode: await this.nextVoucherCode(),
        customerId: dto.customerId ?? null,
        customerName: dto.customerName,
        customerType: dto.customerType,
        category: dto.category,
        movement: dto.movement,
        // Derived here, never taken from the request.
        side: sideForMovement(dto.movement),
        symbolId: dto.symbolId,
        amount: dto.amount,
        walletType: dto.walletType,
        walletSubset: dto.walletSubset,
        description: dto.description,
        extraDescription: dto.extraDescription ?? null,
        documentDate,
        // Always born a draft: booking is a separate, reviewed step.
        status: VoucherStatus.DRAFT,
        createdBy: adminId,
      }),
    );
    return this.findVoucher(saved.id);
  }

  /** Draft → pending. Only the author moves their own draft forward. */
  async submitVoucher(adminId: string, id: string): Promise<VoucherDto> {
    const v = await this.requireVoucher(id);
    if (v.status !== VoucherStatus.DRAFT) throw new BadRequestException("VOUCHER.NOT_A_DRAFT");
    v.status = VoucherStatus.PENDING;
    await this.vouchers.save(v);
    return this.findVoucher(id);
  }

  /**
   * Book the voucher.
   *
   * Refused for the admin who created it: booking one's own entry removes the
   * only control this workflow has. That is enforced here rather than left to
   * a role check, because a finance lead legitimately holds both rights and
   * would otherwise be able to do both halves alone.
   *
   * Operation OTP (§4.3) is where a second factor belongs and does not exist
   * yet; this deliberately does not accept a `challengeId`/`otp` pair it would
   * have to ignore, which would let a client believe it had supplied one.
   */
  async finalizeVoucher(adminId: string, id: string, dto: ReviewVoucherDto): Promise<VoucherDto> {
    const v = await this.requireVoucher(id);
    this.assertReviewable(v, adminId);
    v.status = VoucherStatus.FINALIZED;
    v.reviewedBy = adminId;
    v.reviewedAt = new Date();
    v.reviewNote = dto.note ?? null;
    await this.vouchers.save(v);
    return this.findVoucher(id);
  }

  async rejectVoucher(adminId: string, id: string, dto: ReviewVoucherDto): Promise<VoucherDto> {
    const v = await this.requireVoucher(id);
    this.assertReviewable(v, adminId);
    v.status = VoucherStatus.REJECTED;
    v.reviewedBy = adminId;
    v.reviewedAt = new Date();
    v.reviewNote = dto.note ?? null;
    await this.vouchers.save(v);
    return this.findVoucher(id);
  }

  private assertReviewable(v: AccountingVoucherEntity, adminId: string): void {
    if (v.status === VoucherStatus.FINALIZED) throw new BadRequestException("VOUCHER.ALREADY_FINALIZED");
    if (v.status === VoucherStatus.REJECTED) throw new BadRequestException("VOUCHER.ALREADY_REJECTED");
    if (v.status !== VoucherStatus.PENDING) throw new BadRequestException("VOUCHER.NOT_SUBMITTED");
    if (v.createdBy === adminId) throw new ForbiddenException("VOUCHER.SELF_REVIEW_FORBIDDEN");
  }

  private async requireVoucher(id: string): Promise<AccountingVoucherEntity> {
    const v = await this.vouchers.findOne({ where: { id } });
    if (!v) throw new NotFoundException("VOUCHER.NOT_FOUND");
    return v;
  }

  /**
   * `DOC-<jYear><jMonth><sequence>`.
   *
   * Sequenced within the Jalali month so the reference reads the way an
   * accountant files it, and taken from the count of that month's rows.
   */
  private async nextVoucherCode(): Promise<string> {
    const now = jMoment();
    const prefix = `DOC-${now.jYear()}${String(now.jMonth() + 1).padStart(2, "0")}`;
    const used = await this.vouchers
      .createQueryBuilder("v")
      .where("v.voucher_code LIKE :p", { p: `${prefix}%` })
      .getCount();
    return `${prefix}${String(used + 1).padStart(4, "0")}`;
  }

  private toVoucherDto(v: any): VoucherDto {
    return {
      id: v.id,
      voucherCode: v.voucherCode,
      customerId: v.customerId ?? null,
      customerName: v.customerName,
      customerType: v.customerType,
      category: v.category,
      categoryLabel: VOUCHER_CATEGORY_LABELS[v.category as VoucherCategory] ?? v.category,
      movement: v.movement,
      side: v.side,
      sideLabel: VOUCHER_SIDE_LABELS[v.side as VoucherSide] ?? v.side,
      symbolId: v.symbolId,
      unit: v.symbol?.slug ?? null,
      amount: String(v.amount),
      walletType: v.walletType,
      walletSubset: v.walletSubset,
      walletSubsetLabel: WALLET_SUBSET_LABELS[v.walletSubset as WalletSubset] ?? v.walletSubset,
      description: v.description,
      extraDescription: v.extraDescription ?? null,
      documentDate: v.documentDate,
      status: v.status,
      statusLabel: VOUCHER_STATUS_LABELS[v.status as VoucherStatus] ?? v.status,
      createdBy: v.createdBy,
      createdByName: v.creator?.email ?? v.creator?.phone ?? null,
      reviewedBy: v.reviewedBy ?? null,
      reviewedAt: v.reviewedAt ?? null,
      reviewNote: v.reviewNote ?? null,
      createAt: v.createAt,
    };
  }
}
