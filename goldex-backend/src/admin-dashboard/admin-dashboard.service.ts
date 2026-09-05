import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
// Default import, not `import * as`: moment-jalaali is a CommonJS module whose
// export *is* the callable, and with esModuleInterop the namespace form yields
// an object that is not callable — which typechecks and fails at runtime.
import jMoment from "moment-jalaali";
import { UserEntity } from "../user/entity/user.entity";
import { OrderEntity } from "../order/order.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { WithdrawStatusEnum } from "../withdraw/enum/withdraw-status.enum";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { UserRoleEnum } from "../shared/enum/user.role.enum";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import { DashboardMetric, DashboardSeverity } from "./dashboard.enums";
import {
  DashboardActivityItemDto,
  DashboardDistributionDto,
  DashboardHealthDto,
  DashboardKpisDto,
  DashboardRecentDto,
  DashboardSeriesDto,
} from "./dto/dashboard.dto";

/** Short Jalali month names, as the panels label their axis. */
const JALALI_MONTHS = ["فرو", "ارد", "خرد", "تیر", "مرد", "شهر", "مهر", "آبا", "آذر", "دی", "بهم", "اسف"];

/** How far back the health composition and the deltas look. */
const WINDOW_DAYS = 30;

const ROLE_LABELS: Record<number, string> = {
  [UserRoleEnum.CUSTOMER]: "مشتری",
  [UserRoleEnum.ADMIN]: "ادمین",
  [UserRoleEnum.NEW_USER]: "کاربر جدید",
  [UserRoleEnum.PARTNER]: "شریک",
};

const WITHDRAW_STATUS_LABELS: Record<string, string> = {
  [WithdrawStatusEnum.PENDING]: "در انتظار",
  [WithdrawStatusEnum.PROCESSING]: "در حال پردازش",
  [WithdrawStatusEnum.COMPLETED]: "تکمیل‌شده",
  [WithdrawStatusEnum.FAILED]: "ناموفق",
  [WithdrawStatusEnum.CANCELLED]: "لغو شده",
};

/**
 * The twelve Gregorian half-open ranges that make up a Jalali year.
 *
 * Exported and pure because this is the part most likely to be silently wrong:
 * Jalali months do not line up with Gregorian ones — 1 Farvardin is 21 March —
 * so grouping with `date_trunc('month')` and labelling the buckets in Persian
 * would file roughly ten days of every month under the wrong name. Each range
 * is `[start, end)` so a row on a boundary lands in exactly one bucket.
 */
export function jalaliMonthBounds(jYear: number): { start: Date; end: Date }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const start = jMoment().jYear(jYear).jMonth(i).jDate(1).startOf("day");
    return { start: start.toDate(), end: jMoment(start).add(1, "jMonth").toDate() };
  });
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(WithdrawEntity) private readonly withdraws: Repository<WithdrawEntity>,
    @InjectRepository(SystemLedgerEntity) private readonly ledger: Repository<SystemLedgerEntity>,
  ) {}

  // ── KPI cards ───────────────────────────────────────────────────────────

  /**
   * All four cards in one call.
   *
   * The panel shows them together and any of them can be the active filter, so
   * fetching them separately would be four round trips for one row of cards.
   */
  async kpis(): Promise<DashboardKpisDto> {
    const now = new Date();
    const current = new Date(now.getTime() - WINDOW_DAYS * 864e5);
    const previous = new Date(now.getTime() - 2 * WINDOW_DAYS * 864e5);

    const [
      newUsers,
      newUsersPrev,
      onlineish,
      volume,
      volumePrev,
      profit,
      profitPrev,
      pendingWithdraws,
      pendingAmount,
      withdrawnNow,
      withdrawnPrev,
    ] = await Promise.all([
      this.users.count({ where: { createAt: MoreThanOrEqual(current) } }),
      this.users.count({ where: { createAt: Between(previous, current) } }),
      // IsNull(), not `null`: TypeORM rejects a bare null in a where clause,
      // and an `as any` cast would have hidden that until it ran.
      this.users.count({ where: { blockedAt: IsNull() } }),
      this.sumOrders(current, now),
      this.sumOrders(previous, current),
      this.sumLedger(current, now),
      this.sumLedger(previous, current),
      this.withdraws.count({ where: { status: WithdrawStatusEnum.PENDING } }),
      this.sumWithdraws(WithdrawStatusEnum.PENDING),
      this.sumWithdrawsBetween(current, now),
      this.sumWithdrawsBetween(previous, current),
    ]);

    return {
      cards: [
        {
          metric: DashboardMetric.USERS,
          label: "کاربران",
          value: String(newUsers),
          unit: null,
          deltaPercent: this.delta(newUsers, newUsersPrev),
          sub: `${onlineish} حساب فعال`,
        },
        {
          metric: DashboardMetric.VOLUME,
          label: "حجم معاملات",
          value: volume.toFixed(4),
          // Base units — grams of gold, not money. The panel labels it by this.
          unit: "XAU",
          deltaPercent: this.delta(volume, volumePrev),
          sub: `${WINDOW_DAYS} روز گذشته`,
        },
        {
          metric: DashboardMetric.PROFIT,
          label: "سود پلتفرم",
          value: profit.toFixed(2),
          unit: RIAL_SYMBOL_SLUG,
          deltaPercent: this.delta(profit, profitPrev),
          sub: `${WINDOW_DAYS} روز گذشته`,
        },
        {
          metric: DashboardMetric.WITHDRAWALS,
          label: "برداشت‌ها",
          value: String(pendingWithdraws),
          unit: null,
          deltaPercent: this.delta(withdrawnNow, withdrawnPrev),
          sub: `${pendingAmount.toFixed(0)} ${RIAL_SYMBOL_SLUG} در انتظار`,
        },
      ],
      generatedAt: now.toISOString(),
    };
  }

  // ── Series ──────────────────────────────────────────────────────────────

  /**
   * Twelve Jalali months of the selected metric.
   *
   * Bucketed by **Jalali** month, not Gregorian: the two do not line up — 1
   * Farvardin is 21 March — so grouping by `date_trunc('month')` and labelling
   * the buckets in Persian would put roughly ten days of every month in the
   * wrong bar. Each bucket's Gregorian boundaries are computed with
   * `moment-jalaali` and the rows counted between them.
   *
   * Every month is present even when empty, so the chart keeps twelve bars and
   * the axis does not shift as data arrives.
   */
  async series(metric: DashboardMetric, year?: number): Promise<DashboardSeriesDto> {
    const jYear = year ?? jMoment().jYear();
    const bounds = jalaliMonthBounds(jYear);

    const meta = this.seriesMeta(metric);
    const points = [];
    for (let i = 0; i < 12; i++) {
      const { primary, secondary } = await this.seriesBucket(metric, bounds[i].start, bounds[i].end);
      points.push({
        month: i + 1,
        label: JALALI_MONTHS[i],
        primary: primary.toFixed(meta.digits),
        secondary: secondary.toFixed(meta.digits),
      });
    }

    return { year: jYear, primaryLabel: meta.primary, secondaryLabel: meta.secondary, unit: meta.unit, points };
  }

  private seriesMeta(metric: DashboardMetric) {
    switch (metric) {
      case DashboardMetric.USERS:
        return { primary: "ثبت‌نام", secondary: "مسدود", unit: null as string | null, digits: 0 };
      case DashboardMetric.VOLUME:
        return { primary: "خرید", secondary: "فروش", unit: "XAU", digits: 4 };
      case DashboardMetric.PROFIT:
        return { primary: "درآمد", secondary: "هزینه", unit: RIAL_SYMBOL_SLUG, digits: 2 };
      case DashboardMetric.WITHDRAWALS:
        return { primary: "درخواست", secondary: "پرداخت", unit: RIAL_SYMBOL_SLUG, digits: 2 };
    }
  }

  private async seriesBucket(metric: DashboardMetric, start: Date, end: Date) {
    switch (metric) {
      case DashboardMetric.USERS: {
        const [primary, secondary] = await Promise.all([
          this.users.count({ where: { createAt: Between(start, end) } }),
          this.users.count({ where: { blockedAt: Between(start, end) } }),
        ]);
        return { primary, secondary };
      }
      case DashboardMetric.VOLUME: {
        const [buy, sell] = await Promise.all([
          this.sumOrders(start, end, "BUY"),
          this.sumOrders(start, end, "SELL"),
        ]);
        return { primary: buy, secondary: sell };
      }
      case DashboardMetric.PROFIT: {
        // Income and expense are the two signs of the same column: a negative
        // ledger amount is an adjustment against the platform, not a separate
        // type, so splitting by sign is the only honest split available.
        const rows = await this.ledger.find({
          where: { createdAt: Between(start, end) } as any,
          select: { id: true, amount: true } as any,
        });
        let income = 0;
        let expense = 0;
        for (const r of rows) {
          const n = Number((r as any).amount) || 0;
          if (n >= 0) income += n;
          else expense += -n;
        }
        return { primary: income, secondary: expense };
      }
      case DashboardMetric.WITHDRAWALS: {
        const [requested, paid] = await Promise.all([
          this.sumWithdrawsBetween(start, end),
          this.sumWithdrawsBetween(start, end, WithdrawStatusEnum.COMPLETED),
        ]);
        return { primary: requested, secondary: paid };
      }
    }
  }

  // ── Distribution ────────────────────────────────────────────────────────

  async distribution(metric: DashboardMetric): Promise<DashboardDistributionDto> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);

    switch (metric) {
      case DashboardMetric.USERS: {
        const rows = await this.users
          .createQueryBuilder("u")
          .select("u.role", "key")
          .addSelect("COUNT(*)", "value")
          .groupBy("u.role")
          .getRawMany<{ key: number; value: string }>();
        return this.toDistribution(
          "توزیع کاربران",
          rows.map((r) => ({ label: ROLE_LABELS[Number(r.key)] ?? `نقش ${r.key}`, value: Number(r.value) })),
        );
      }
      case DashboardMetric.VOLUME: {
        const rows = await this.orders
          .createQueryBuilder("o")
          .leftJoin("o.pricePair", "pair")
          .leftJoin("pair.baseSymbol", "base")
          .select("COALESCE(base.slug, 'نامشخص')", "key")
          .addSelect("COALESCE(SUM(o.executed_quantity), 0)", "value")
          .where("o.created_at >= :since", { since })
          .groupBy("base.slug")
          .getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "سهم نمادها",
          rows.map((r) => ({ label: r.key, value: Number(r.value) })),
        );
      }
      case DashboardMetric.PROFIT: {
        const rows = await this.ledger
          .createQueryBuilder("l")
          .select("l.type", "key")
          .addSelect("COALESCE(SUM(ABS(l.amount)), 0)", "value")
          .where("l.created_at >= :since", { since })
          .groupBy("l.type")
          .getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "منابع سود",
          rows.map((r) => ({ label: r.key, value: Number(r.value) })),
        );
      }
      case DashboardMetric.WITHDRAWALS: {
        const rows = await this.withdraws
          .createQueryBuilder("w")
          .select("w.status", "key")
          .addSelect("COUNT(*)", "value")
          .where("w.created_at >= :since", { since })
          .groupBy("w.status")
          .getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "وضعیت برداشت‌ها",
          rows.map((r) => ({ label: WITHDRAW_STATUS_LABELS[r.key] ?? r.key, value: Number(r.value) })),
        );
      }
    }
  }

  /**
   * Largest four slices, with the tail folded into «سایر».
   *
   * The panel's pie has four wedges; returning twenty would either overflow it
   * or make the client decide what to drop, and the client cannot sum what it
   * was not sent.
   */
  private toDistribution(title: string, raw: { label: string; value: number }[]): DashboardDistributionDto {
    const sorted = raw.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, 4);
    const tail = sorted.slice(4);
    if (tail.length > 0) {
      head.push({ label: "سایر", value: tail.reduce((s, r) => s + r.value, 0) });
    }
    const total = head.reduce((s, r) => s + r.value, 0);
    return {
      title,
      slices: head.map((r) => ({
        label: r.label,
        value: r.value.toFixed(4).replace(/\.?0+$/, ""),
        percent: total === 0 ? 0 : Number(((r.value / total) * 100).toFixed(1)),
      })),
    };
  }

  // ── Activity feed ───────────────────────────────────────────────────────

  async activity(metric: DashboardMetric, limit = 5): Promise<DashboardActivityItemDto[]> {
    switch (metric) {
      case DashboardMetric.USERS: {
        const rows = await this.users.find({ order: { createAt: "DESC" }, take: limit });
        return rows.map((u) => ({
          id: u.id,
          title: "کاربر جدید ثبت‌نام کرد",
          description: this.personName(u) || u.phone || u.email || u.id,
          severity: u.blockedAt ? DashboardSeverity.BAD : DashboardSeverity.GOOD,
          at: u.createAt,
        }));
      }
      case DashboardMetric.VOLUME: {
        const rows = await this.orders.find({
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
        });
        return rows.map((o) => ({
          id: o.id,
          title: `سفارش ${o.side === "BUY" ? "خرید" : "فروش"} — ${o.status}`,
          description: `${this.personName((o as any).user)} — ${Number(o.executedQuantity) || 0} ${this.pairLabel((o as any).pricePair)}`,
          severity: this.orderSeverity(o.status),
          at: o.createAt,
        }));
      }
      case DashboardMetric.PROFIT: {
        const rows = await this.ledger.find({
          order: { createdAt: "DESC" } as any,
          take: limit,
          relations: { symbol: true } as any,
        });
        return rows.map((l: any) => ({
          id: l.id,
          title: l.type,
          description: `${l.amount} ${l.symbol?.slug ?? ""}${l.providerKey ? ` — ${l.providerKey}` : ""}`.trim(),
          severity: Number(l.amount) >= 0 ? DashboardSeverity.GOOD : DashboardSeverity.WARN,
          at: l.createdAt,
        }));
      }
      case DashboardMetric.WITHDRAWALS: {
        const rows = await this.withdraws.find({
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, symbol: true } as any,
        });
        return rows.map((w: any) => ({
          id: w.id,
          title: `برداشت — ${WITHDRAW_STATUS_LABELS[w.status] ?? w.status}`,
          description: `${this.personName(w.user)} — ${w.amount} ${w.symbol?.slug ?? ""}`.trim(),
          severity: this.withdrawSeverity(w.status),
          at: w.createAt,
        }));
      }
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────

  /**
   * The composition of the last thirty days, as percentages.
   *
   * Not an uptime probe: this platform records no such signal, and inventing
   * one would be a number an operator could act on wrongly. What it can say
   * truthfully is how the recent rows divide — how many orders completed, how
   * many withdrawals are still waiting — which is what the panel's strip is
   * read for.
   */
  async health(metric: DashboardMetric): Promise<DashboardHealthDto> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);

    const compose = (
      title: string,
      counts: { label: string; count: number; good?: boolean; bad?: boolean }[],
    ): DashboardHealthDto => {
      const total = counts.reduce((s, c) => s + c.count, 0);
      return {
        title,
        windowDays: WINDOW_DAYS,
        rows: counts.map((c) => ({
          label: c.label,
          count: c.count,
          percent: total === 0 ? 0 : Number(((c.count / total) * 100).toFixed(1)),
          variant: c.bad
            ? DashboardSeverity.BAD
            : c.good
              ? DashboardSeverity.GOOD
              : DashboardSeverity.WARN,
        })),
      };
    };

    switch (metric) {
      case DashboardMetric.USERS: {
        const [active, blocked] = await Promise.all([
          this.users.count({ where: { blockedAt: IsNull() } }),
          this.users.count({ where: { blockedAt: Not(IsNull()) } }),
        ]);
        return compose("وضعیت حساب‌ها", [
          { label: "فعال", count: active, good: true },
          { label: "مسدود", count: blocked, bad: true },
        ]);
      }
      case DashboardMetric.VOLUME: {
        const rows = await this.groupCount(this.orders, "o", "status", since);
        return compose(
          "سلامت موتور معاملات",
          rows.map((r) => ({
            label: r.key,
            count: r.count,
            good: r.key === "COMPLETED",
            bad: r.key.includes("CANCEL") || r.key.includes("REJECT") || r.key.includes("FAIL"),
          })),
        );
      }
      case DashboardMetric.PROFIT: {
        const rows = await this.groupCount(this.ledger, "l", "type", since, "created_at");
        return compose(
          "ترکیب دفتر سیستم",
          rows.map((r) => ({ label: r.key, count: r.count, good: !r.key.includes("ADJUST") })),
        );
      }
      case DashboardMetric.WITHDRAWALS: {
        const rows = await this.groupCount(this.withdraws, "w", "status", since);
        return compose(
          "سلامت سیستم پرداخت",
          rows.map((r) => ({
            label: WITHDRAW_STATUS_LABELS[r.key] ?? r.key,
            count: r.count,
            good: r.key === WithdrawStatusEnum.COMPLETED,
            bad: r.key === WithdrawStatusEnum.FAILED,
          })),
        );
      }
    }
  }

  // ── Recent table ────────────────────────────────────────────────────────

  async recent(metric: DashboardMetric, limit = 5): Promise<DashboardRecentDto> {
    switch (metric) {
      case DashboardMetric.USERS: {
        const rows = await this.users.find({ order: { createAt: "DESC" }, take: limit });
        return {
          title: "آخرین کاربران",
          columns: ["شناسه", "کاربر", "موبایل", "نقش", "پیوستن"],
          unit: null,
          rows: rows.map((u) => ({
            id: u.id,
            cells: [
              u.id.slice(0, 8),
              this.personName(u),
              u.phone ?? "",
              ROLE_LABELS[u.role] ?? String(u.role),
              u.createAt?.toISOString() ?? "",
            ],
            status: u.blockedAt ? "BLOCKED" : "ACTIVE",
          })),
        };
      }
      case DashboardMetric.VOLUME: {
        const rows = await this.orders.find({
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
        });
        return {
          title: "آخرین تراکنش‌ها",
          columns: ["شناسه", "کاربر", "سمت", "جفت‌ارز", "مقدار", "ارزش"],
          // The value column is in the pair's quote — rial for a rial-quoted
          // pair, which the panel shows as toman.
          unit: RIAL_SYMBOL_SLUG,
          rows: rows.map((o: any) => ({
            id: o.id,
            cells: [
              o.orderCode ?? o.id.slice(0, 8),
              this.personName(o.user),
              o.side === "BUY" ? "خرید" : "فروش",
              this.pairLabel(o.pricePair),
              String(o.executedQuantity ?? ""),
              String(o.totalValue ?? ""),
            ],
            status: o.status,
          })),
        };
      }
      case DashboardMetric.PROFIT: {
        const rows = await this.ledger.find({
          order: { createdAt: "DESC" } as any,
          take: limit,
          relations: { symbol: true } as any,
        });
        return {
          title: "آخرین سودها",
          columns: ["شناسه", "نوع", "نماد", "مبلغ", "تأمین‌کننده"],
          unit: RIAL_SYMBOL_SLUG,
          rows: rows.map((l: any) => ({
            id: l.id,
            cells: [l.id.slice(0, 8), l.type, l.symbol?.slug ?? "", String(l.amount ?? ""), l.providerKey ?? ""],
            status: null,
          })),
        };
      }
      case DashboardMetric.WITHDRAWALS: {
        const rows = await this.withdraws.find({
          where: { status: WithdrawStatusEnum.PENDING },
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, symbol: true } as any,
        });
        return {
          title: "برداشت‌های در انتظار",
          columns: ["شناسه", "کاربر", "نماد", "مبلغ", "نوع", "زمان"],
          unit: RIAL_SYMBOL_SLUG,
          rows: rows.map((w: any) => ({
            id: w.id,
            cells: [
              w.id.slice(0, 8),
              this.personName(w.user),
              w.symbol?.slug ?? "",
              String(w.amount ?? ""),
              w.type ?? "",
              w.createAt?.toISOString() ?? "",
            ],
            status: w.status,
          })),
        };
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async groupCount(
    repo: Repository<any>,
    alias: string,
    column: string,
    since: Date,
    dateColumn = "created_at",
  ): Promise<{ key: string; count: number }[]> {
    const rows = await repo
      .createQueryBuilder(alias)
      .select(`${alias}.${column}`, "key")
      .addSelect("COUNT(*)", "count")
      .where(`${alias}.${dateColumn} >= :since`, { since })
      .groupBy(`${alias}.${column}`)
      .getRawMany<{ key: string; count: string }>();
    return rows.map((r) => ({ key: String(r.key), count: Number(r.count) }));
  }

  private async sumOrders(from: Date, to: Date, side?: "BUY" | "SELL"): Promise<number> {
    const qb = this.orders
      .createQueryBuilder("o")
      .select("COALESCE(SUM(o.executed_quantity), 0)", "total")
      .where("o.created_at >= :from AND o.created_at < :to", { from, to });
    if (side) qb.andWhere("o.side = :side", { side });
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async sumLedger(from: Date, to: Date): Promise<number> {
    const { total } = await this.ledger
      .createQueryBuilder("l")
      .select("COALESCE(SUM(l.amount), 0)", "total")
      .where("l.created_at >= :from AND l.created_at < :to", { from, to })
      .getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async sumWithdraws(status: WithdrawStatusEnum): Promise<number> {
    const { total } = await this.withdraws
      .createQueryBuilder("w")
      .select("COALESCE(SUM(w.amount), 0)", "total")
      .where("w.status = :status", { status })
      .getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async sumWithdrawsBetween(from: Date, to: Date, status?: WithdrawStatusEnum): Promise<number> {
    const qb = this.withdraws
      .createQueryBuilder("w")
      .select("COALESCE(SUM(w.amount), 0)", "total")
      .where("w.created_at >= :from AND w.created_at < :to", { from, to });
    if (status) qb.andWhere("w.status = :status", { status });
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  /**
   * Percent change, or null.
   *
   * Null when the previous period was empty: a rise from zero has no
   * percentage, and reporting it as 100% or ∞ would put a number on the card
   * that means nothing.
   */
  private delta(current: number, previous: number): number | null {
    if (!previous) return null;
    return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
  }

  private personName(person: any): string {
    if (!person) return "";
    return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() || person.phone || "";
  }

  private pairLabel(pair: any): string {
    if (!pair) return "";
    return `${pair.baseSymbol?.slug ?? "?"}/${pair.quoteSymbol?.slug ?? "?"}`;
  }

  private orderSeverity(status: string): DashboardSeverity {
    const s = String(status).toUpperCase();
    if (s === "COMPLETED") return DashboardSeverity.GOOD;
    if (s.includes("CANCEL") || s.includes("REJECT") || s.includes("FAIL")) return DashboardSeverity.BAD;
    return DashboardSeverity.INFO;
  }

  private withdrawSeverity(status: string): DashboardSeverity {
    if (status === WithdrawStatusEnum.COMPLETED) return DashboardSeverity.GOOD;
    if (status === WithdrawStatusEnum.FAILED) return DashboardSeverity.BAD;
    if (status === WithdrawStatusEnum.PENDING) return DashboardSeverity.WARN;
    return DashboardSeverity.INFO;
  }
}
