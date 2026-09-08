import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, IsNull, MoreThanOrEqual, Not, Repository } from "typeorm";
// Default import, not `import * as`: moment-jalaali is a CommonJS module whose
// export *is* the callable, and with esModuleInterop the namespace form yields
// an object that is not callable — which typechecks and fails at runtime.
import jMoment from "moment-jalaali";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { ProviderEntity } from "../provider/entity/provider.entity";
import { ProviderPairMappingEntity } from "../provider-pair-mapping/entity/provider-pair-mapping.entity";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";
import { CreditEntity } from "../credit/entity/credit.entity";
import { CreditStatusEnum } from "../credit/enum/credit-status.enum";
import { PacketEntity } from "../warehouse/entity/packet.entity";
import { PacketStatusEnum } from "../warehouse/enum/packet-status.enum";
import { WarehouseEntity } from "../warehouse/entity/warehouse.entity";
import { OrderTypeEnum } from "../order/enum/order.type.enum";
import { OrderStatusEnum } from "../order/enum/order.status.enum";
import { WithdrawTypeEnum } from "../admin-symbol/enum/withdraw-type.enum";
import { OrderEntity } from "../order/order.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { WithdrawStatusEnum } from "../withdraw/enum/withdraw-status.enum";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { UserRoleEnum } from "../shared/enum/user.role.enum";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import {
  DashboardMetric,
  DashboardSeverity,
  DashboardVolumeCategory,
  DashboardWithdrawChannel,
} from "./dashboard.enums";
import {
  DashboardActivityItemDto,
  DashboardColumnKind,
  DashboardDistributionDto,
  DashboardHealthDto,
  DashboardKpisDto,
  DashboardFilterOptionDto,
  DashboardKpiDto,
  DashboardRecentDto,
  DashboardSeriesDto,
  DashboardStatDto,
} from "./dto/dashboard.dto";

/** Short Jalali month names, as the panels label their axis. */
const JALALI_MONTHS = ["فرو", "ارد", "خرد", "تیر", "مرد", "شهر", "مهر", "آبا", "آذر", "دی", "بهم", "اسف"];

/** Shorthand for the column-kind enum, which appears once per table column. */
const K = DashboardColumnKind;

/** How far back the health composition and the deltas look. */
const WINDOW_DAYS = 30;

const ROLE_LABELS: Record<number, string> = {
  [UserRoleEnum.CUSTOMER]: "مشتری",
  [UserRoleEnum.ADMIN]: "ادمین",
  [UserRoleEnum.NEW_USER]: "کاربر جدید",
  [UserRoleEnum.PARTNER]: "شریک",
};

const CATEGORY_LABELS: Record<DashboardVolumeCategory, string> = {
  [DashboardVolumeCategory.MATERIAL]: "فلزات گران‌بها",
  [DashboardVolumeCategory.CRYPTO]: "رمزارز",
  [DashboardVolumeCategory.FIAT]: "ارز",
  [DashboardVolumeCategory.RIAL]: "ریال",
};

/** The symbol type each volume category is measured over. */
const CATEGORY_SYMBOL_TYPE: Record<DashboardVolumeCategory, SymbolTypeEnum> = {
  [DashboardVolumeCategory.MATERIAL]: SymbolTypeEnum.MATERIAL,
  [DashboardVolumeCategory.CRYPTO]: SymbolTypeEnum.CRYPTO,
  [DashboardVolumeCategory.FIAT]: SymbolTypeEnum.FIAT,
  [DashboardVolumeCategory.RIAL]: SymbolTypeEnum.RIAL,
};

const WITHDRAW_CHANNEL_LABELS: Record<DashboardWithdrawChannel, string> = {
  [DashboardWithdrawChannel.AUTO]: "خودکار",
  [DashboardWithdrawChannel.MANUAL]: "دستی",
  [DashboardWithdrawChannel.EM]: "EM (نظیر‌به‌نظیر)",
};

/**
 * How a channel is stored.
 *
 * The EM screen is a projection of the P2P flow, so its withdrawals are `p2p`
 * rows; operators call the screen EM, which is why the filter does too.
 */
const WITHDRAW_CHANNEL_TYPES: Record<DashboardWithdrawChannel, string> = {
  [DashboardWithdrawChannel.AUTO]: WithdrawTypeEnum.AUTO,
  [DashboardWithdrawChannel.MANUAL]: WithdrawTypeEnum.MANUAL,
  [DashboardWithdrawChannel.EM]: WithdrawTypeEnum.P2P,
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  [OrderTypeEnum.MARKET]: "مارکت",
  [OrderTypeEnum.LIMIT]: "لیمیت",
  [OrderTypeEnum.QUOTE]: "استعلامی",
};

const PACKET_STATUS_LABELS: Record<string, string> = {
  [PacketStatusEnum.PENDING]: "در حال آماده‌سازی",
  [PacketStatusEnum.IN_WAREHOUSE]: "در انبار",
  [PacketStatusEnum.RELEASED]: "تحویل‌شده",
  [PacketStatusEnum.WITHDRAWN]: "خارج‌شده",
  [PacketStatusEnum.ORPHAN]: "بی‌صاحب",
};

const CREDIT_STATUS_LABELS: Record<string, string> = {
  [CreditStatusEnum.PENDING]: "در انتظار",
  [CreditStatusEnum.ACTIVE]: "فعال",
  [CreditStatusEnum.SUSPENDED]: "معلق",
  [CreditStatusEnum.SETTLED]: "تسویه‌شده",
  [CreditStatusEnum.EXPIRED]: "منقضی",
  [CreditStatusEnum.CANCELLED]: "لغوشده",
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
    @InjectRepository(UserKycEntity) private readonly kyc: Repository<UserKycEntity>,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(WithdrawEntity) private readonly withdraws: Repository<WithdrawEntity>,
    @InjectRepository(SystemLedgerEntity) private readonly ledger: Repository<SystemLedgerEntity>,
    @InjectRepository(ProviderEntity) private readonly providers: Repository<ProviderEntity>,
    @InjectRepository(ProviderPairMappingEntity)
    private readonly mappings: Repository<ProviderPairMappingEntity>,
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly dealSnapshots: Repository<ProviderDealSnapshotEntity>,
    @InjectRepository(PricePairEntity) private readonly pairs: Repository<PricePairEntity>,
    @InjectRepository(SymbolEntity) private readonly symbols: Repository<SymbolEntity>,
    @InjectRepository(CreditEntity) private readonly credits: Repository<CreditEntity>,
    @InjectRepository(PacketEntity) private readonly packets: Repository<PacketEntity>,
    @InjectRepository(WarehouseEntity) private readonly warehouses: Repository<WarehouseEntity>,
  ) {}

  // ── KPI cards ───────────────────────────────────────────────────────────

  /** Every card, unfiltered, in display order. */
  async kpis(): Promise<DashboardKpisDto> {
    const order = [
      DashboardMetric.USERS,
      DashboardMetric.VOLUME,
      DashboardMetric.PROFIT,
      DashboardMetric.WITHDRAWALS,
      DashboardMetric.PROVIDERS,
      DashboardMetric.TRADES,
      DashboardMetric.CREDITS,
      DashboardMetric.INVENTORY,
    ];
    return {
      cards: await Promise.all(order.map((metric) => this.card(metric))),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * One card, optionally narrowed.
   *
   * The panel re-fetches a single card when its filter changes, rather than
   * the whole row: seven of the eight would come back identical.
   */
  async card(metric: DashboardMetric, filter?: string): Promise<DashboardKpiDto> {
    const [filters, built] = await Promise.all([
      this.filtersFor(metric),
      this.cardBody(metric, this.normalizeFilter(metric, filter)),
    ]);
    return {
      metric,
      label: built.label,
      stats: built.stats,
      filterLabel: built.filterLabel ?? null,
      filters,
      activeFilter: this.normalizeFilter(metric, filter) ?? null,
      deltaPercent: built.deltaPercent ?? null,
    };
  }

  /**
   * The values a card's filter accepts.
   *
   * Served from the database where the options are rows — pairs, symbols,
   * warehouses — so the panel never has to know what a warehouse is called.
   */
  async filtersFor(metric: DashboardMetric): Promise<DashboardFilterOptionDto[]> {
    switch (metric) {
      case DashboardMetric.VOLUME:
        return Object.values(DashboardVolumeCategory).map((value) => ({
          value,
          label: CATEGORY_LABELS[value],
        }));
      case DashboardMetric.WITHDRAWALS:
        return Object.values(DashboardWithdrawChannel).map((value) => ({
          value,
          label: WITHDRAW_CHANNEL_LABELS[value],
        }));
      case DashboardMetric.TRADES:
        return Object.values(OrderTypeEnum).map((value) => ({
          value,
          label: ORDER_TYPE_LABELS[value] ?? value,
        }));
      case DashboardMetric.PROVIDERS: {
        const rows = await this.pairs.find({
          relations: { baseSymbol: true, quoteSymbol: true },
          order: { createAt: "ASC" },
          take: 100,
        });
        return rows.map((pair) => ({ value: pair.id, label: this.pairLabel(pair) }));
      }
      case DashboardMetric.CREDITS: {
        const rows = await this.symbols.find({ order: { createAt: "ASC" }, take: 100 });
        return rows.map((symbol) => ({ value: symbol.id, label: symbol.slug ?? symbol.name }));
      }
      case DashboardMetric.INVENTORY: {
        const rows = await this.warehouses.find({ order: { createAt: "ASC" }, take: 100 });
        return rows.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }));
      }
      default:
        return [];
    }
  }

  /**
   * Drops a filter the metric does not offer.
   *
   * A stale bookmark or a card whose filter was left selected while the metric
   * changed should render the metric as a whole, not an error page.
   */
  private normalizeFilter(metric: DashboardMetric, filter?: string): string | undefined {
    if (!filter) return undefined;
    switch (metric) {
      case DashboardMetric.VOLUME:
        return Object.values(DashboardVolumeCategory).includes(filter as DashboardVolumeCategory)
          ? filter
          : undefined;
      case DashboardMetric.WITHDRAWALS:
        return Object.values(DashboardWithdrawChannel).includes(filter as DashboardWithdrawChannel)
          ? filter
          : undefined;
      case DashboardMetric.TRADES:
        return Object.values(OrderTypeEnum).includes(filter as OrderTypeEnum) ? filter : undefined;
      // Pair, symbol and warehouse ids are opaque here: a wrong one simply
      // matches nothing, which reads as an empty card rather than a lie.
      case DashboardMetric.PROVIDERS:
      case DashboardMetric.CREDITS:
      case DashboardMetric.INVENTORY:
        return filter;
      default:
        return undefined;
    }
  }

  private async cardBody(
    metric: DashboardMetric,
    filter?: string
  ): Promise<{
    label: string;
    stats: DashboardStatDto[];
    filterLabel?: string;
    deltaPercent?: number | null;
  }> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - WINDOW_DAYS * 864e5);
    const prevMonth = new Date(now.getTime() - 2 * WINDOW_DAYS * 864e5);

    switch (metric) {
      case DashboardMetric.USERS: {
        const [active, blocked, underReview, joined, joinedPrev] = await Promise.all([
          this.users.count({ where: { blockedAt: IsNull() } }),
          this.users.count({ where: { blockedAt: Not(IsNull()) } }),
          // "Under review" is a KYC state, not a user one: a submitted dossier
          // waiting on an operator is the queue this number stands for.
          this.kyc.count({ where: { status: KycStatusEnum.PENDING } }),
          this.users.count({ where: { createAt: MoreThanOrEqual(monthAgo) } }),
          this.users.count({ where: { createAt: Between(prevMonth, monthAgo) } }),
        ]);
        return {
          label: "کاربران",
          deltaPercent: this.delta(joined, joinedPrev),
          stats: [
            { label: "حساب‌های فعال", value: String(active), unit: null },
            { label: "حساب‌های مسدود", value: String(blocked), unit: null },
            { label: "در حین بررسی", value: String(underReview), unit: null, hint: "احراز هویت" },
          ],
        };
      }

      case DashboardMetric.VOLUME: {
        const category = filter as DashboardVolumeCategory | undefined;
        const [sell, buy, profit, volumeNow, volumePrev] = await Promise.all([
          this.orderValue(monthAgo, now, category, "SELL"),
          this.orderValue(monthAgo, now, category, "BUY"),
          this.ledgerSum(monthAgo, now, category),
          this.orderValue(monthAgo, now, category),
          this.orderValue(prevMonth, monthAgo, category),
        ]);
        return {
          label: category ? `حجم معاملات — ${CATEGORY_LABELS[category]}` : "حجم معاملات",
          filterLabel: "دسته‌بندی",
          deltaPercent: this.delta(volumeNow, volumePrev),
          stats: [
            { label: "حجم کل فروش", value: sell.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: `${WINDOW_DAYS} روز` },
            { label: "حجم کل خرید", value: buy.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: `${WINDOW_DAYS} روز` },
            { label: "حجم سود", value: profit.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: "دفتر سیستم" },
          ],
        };
      }

      case DashboardMetric.PROFIT: {
        const dayAgo = new Date(now.getTime() - 864e5);
        const [today, month, gross, prevMonthNet] = await Promise.all([
          this.sumLedger(dayAgo, now),
          this.sumLedger(monthAgo, now),
          // Gross is income before the adjustments against it: the positive
          // side of the same column, which is the only split the ledger keeps.
          this.grossLedger(monthAgo, now),
          this.sumLedger(prevMonth, monthAgo),
        ]);
        return {
          label: "سود",
          deltaPercent: this.delta(month, prevMonthNet),
          stats: [
            { label: "سود خالص روز", value: today.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: "۲۴ ساعت" },
            { label: "سود خالص ماه", value: month.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: `${WINDOW_DAYS} روز` },
            { label: "سود خام", value: gross.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: "پیش از کسورات" },
          ],
        };
      }

      case DashboardMetric.WITHDRAWALS: {
        const channel = filter as DashboardWithdrawChannel | undefined;
        const type = channel ? WITHDRAW_CHANNEL_TYPES[channel] : undefined;
        const [pendingCount, pendingAmount, completedAmount, paidNow, paidPrev] = await Promise.all([
          this.withdrawCount(WithdrawStatusEnum.PENDING, type),
          this.withdrawSum(WithdrawStatusEnum.PENDING, type),
          this.withdrawSumBetween(monthAgo, now, WithdrawStatusEnum.COMPLETED, type),
          this.withdrawSumBetween(monthAgo, now, undefined, type),
          this.withdrawSumBetween(prevMonth, monthAgo, undefined, type),
        ]);
        return {
          label: channel ? `برداشت ریال — ${WITHDRAW_CHANNEL_LABELS[channel]}` : "برداشت ریال",
          filterLabel: "کانال",
          deltaPercent: this.delta(paidNow, paidPrev),
          stats: [
            { label: "تعداد در انتظار", value: String(pendingCount), unit: null },
            { label: "مبلغ در انتظار", value: pendingAmount.toFixed(2), unit: RIAL_SYMBOL_SLUG },
            {
              label: "مبلغ انجام‌شده",
              value: completedAmount.toFixed(2),
              unit: RIAL_SYMBOL_SLUG,
              hint: `${WINDOW_DAYS} روز`,
            },
          ],
        };
      }

      case DashboardMetric.PROVIDERS: {
        const keys = filter ? await this.providerKeysForPair(filter) : null;
        const rows = await this.providers.find();
        const scoped = keys ? rows.filter((p) => keys.includes(p.key)) : rows;
        const active = scoped.filter((p) => p.active).length;
        return {
          label: "تأمین‌کنندگان",
          filterLabel: "جفت‌ارز",
          stats: [
            { label: "تعداد تأمین‌کننده", value: String(scoped.length), unit: null },
            { label: "فعال", value: String(active), unit: null },
            { label: "غیرفعال", value: String(scoped.length - active), unit: null },
          ],
        };
      }

      case DashboardMetric.TRADES: {
        const dayAgo = new Date(now.getTime() - 864e5);
        const weekAgo = new Date(now.getTime() - 7 * 864e5);
        const type = filter as OrderTypeEnum | undefined;
        const [doneToday, rejectedToday, week, prevWeek] = await Promise.all([
          this.orderCount(dayAgo, now, type, [OrderStatusEnum.COMPLETED]),
          this.orderCount(dayAgo, now, type, [OrderStatusEnum.REJECTED, OrderStatusEnum.CANCELLED]),
          this.orderCount(weekAgo, now, type),
          this.orderCount(new Date(weekAgo.getTime() - 7 * 864e5), weekAgo, type),
        ]);
        return {
          label: type ? `معاملات — ${ORDER_TYPE_LABELS[type] ?? type}` : "معاملات",
          filterLabel: "نوع سفارش",
          deltaPercent: this.delta(week, prevWeek),
          stats: [
            { label: "انجام‌شده امروز", value: String(doneToday), unit: null },
            { label: "ردشده امروز", value: String(rejectedToday), unit: null, hint: "رد یا لغو" },
            { label: "کل ۷ روز اخیر", value: String(week), unit: null },
          ],
        };
      }

      case DashboardMetric.CREDITS: {
        const rows = await this.collateralRows(filter);
        const holders = new Set(rows.map((r) => r.userId)).size;
        const amount = rows.reduce((sum, r) => sum + (Number(r.collateralAmount) || 0), 0);
        // Loss is what the collateral has shed since it was pledged: only the
        // downside counts, so a position that gained does not net it off.
        const loss = rows.reduce((sum, r) => {
          const initial = Number(r.initialCollateralValue) || 0;
          const current = Number(r.currentCollateralValue) || 0;
          return sum + Math.max(0, initial - current);
        }, 0);
        const symbol = filter ? await this.symbols.findOne({ where: { id: filter } }) : null;
        return {
          label: symbol ? `اعتبارها — ${symbol.slug ?? symbol.name}` : "اعتبارها",
          filterLabel: "نماد وثیقه",
          stats: [
            { label: "تعداد وثیقه‌گذار", value: String(holders), unit: null },
            {
              label: "مقدار وثیقه",
              value: amount.toFixed(4),
              unit: symbol?.slug ?? null,
              hint: symbol ? null : "به واحد هر نماد",
            },
            { label: "زیان وثیقه", value: loss.toFixed(2), unit: RIAL_SYMBOL_SLUG, hint: "ارزش پایه" },
          ],
        };
      }

      case DashboardMetric.INVENTORY: {
        const [total, packing, orphan, warehouse] = await Promise.all([
          this.packetTotals(filter),
          this.packetTotals(filter, { status: PacketStatusEnum.PENDING }),
          this.packetTotals(filter, { orphan: true }),
          filter ? this.warehouses.findOne({ where: { id: filter } }) : null,
        ]);
        return {
          label: warehouse ? `انبار — ${warehouse.name}` : "انبار",
          filterLabel: "انبار",
          stats: [
            {
              label: "تعداد / وزن کل",
              value: String(total.count),
              unit: null,
              hint: `${total.weight.toFixed(3)} گرم`,
            },
            {
              label: "در حال آماده‌سازی",
              value: String(packing.count),
              unit: null,
              hint: `${packing.weight.toFixed(3)} گرم`,
            },
            {
              label: "بسته‌های بی‌صاحب",
              value: String(orphan.count),
              unit: null,
              hint: `${orphan.weight.toFixed(3)} گرم`,
            },
          ],
        };
      }
    }
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
  async series(metric: DashboardMetric, year?: number, filter?: string): Promise<DashboardSeriesDto> {
    const jYear = year ?? jMoment().jYear();
    const bounds = jalaliMonthBounds(jYear);
    const scope = this.normalizeFilter(metric, filter);

    const meta = this.seriesMeta(metric);
    const points = [];
    for (let i = 0; i < 12; i++) {
      const { primary, secondary } = await this.seriesBucket(
        metric,
        bounds[i].start,
        bounds[i].end,
        scope
      );
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
      case DashboardMetric.PROVIDERS:
        return { primary: "ارسال به تأمین‌کننده", secondary: "تکمیل‌شده", unit: null, digits: 0 };
      case DashboardMetric.TRADES:
        return { primary: "انجام‌شده", secondary: "ردشده", unit: null, digits: 0 };
      case DashboardMetric.CREDITS:
        return { primary: "اعتبار صادرشده", secondary: "وثیقه", unit: RIAL_SYMBOL_SLUG, digits: 2 };
      case DashboardMetric.INVENTORY:
        return { primary: "ورودی", secondary: "بی‌صاحب", unit: null, digits: 0 };
    }
  }

  private async seriesBucket(metric: DashboardMetric, start: Date, end: Date, filter?: string) {
    switch (metric) {
      case DashboardMetric.USERS: {
        const [primary, secondary] = await Promise.all([
          this.users.count({ where: { createAt: Between(start, end) } }),
          this.users.count({ where: { blockedAt: Between(start, end) } }),
        ]);
        return { primary, secondary };
      }
      case DashboardMetric.VOLUME: {
        const category = filter as DashboardVolumeCategory | undefined;
        const [buy, sell] = await Promise.all([
          this.orderValue(start, end, category, "BUY"),
          this.orderValue(start, end, category, "SELL"),
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
        const channel = filter as DashboardWithdrawChannel | undefined;
        const type = channel ? WITHDRAW_CHANNEL_TYPES[channel] : undefined;
        const [requested, paid] = await Promise.all([
          this.withdrawSumBetween(start, end, undefined, type),
          this.withdrawSumBetween(start, end, WithdrawStatusEnum.COMPLETED, type),
        ]);
        return { primary: requested, secondary: paid };
      }
      case DashboardMetric.PROVIDERS: {
        // Orders that actually reached a provider are the only per-month trace
        // of provider flow the platform keeps: the engine's deal table is
        // mirrored as running totals, with no history to bucket.
        const base = this.orders
          .createQueryBuilder("o")
          .where("o.created_at >= :start AND o.created_at < :end", { start, end })
          .andWhere("o.provider_order_id IS NOT NULL");
        const [primary, secondary] = await Promise.all([
          base.clone().getCount(),
          base.clone().andWhere("o.status = :status", { status: OrderStatusEnum.COMPLETED }).getCount(),
        ]);
        return { primary, secondary };
      }
      case DashboardMetric.TRADES: {
        const type = filter as OrderTypeEnum | undefined;
        const [primary, secondary] = await Promise.all([
          this.orderCount(start, end, type, [OrderStatusEnum.COMPLETED]),
          this.orderCount(start, end, type, [
            OrderStatusEnum.REJECTED,
            OrderStatusEnum.CANCELLED,
          ]),
        ]);
        return { primary, secondary };
      }
      case DashboardMetric.CREDITS: {
        const qb = this.credits
          .createQueryBuilder("c")
          .select("COALESCE(SUM(c.amount), 0)", "credit")
          .addSelect("COALESCE(SUM(c.initial_collateral_value), 0)", "collateral")
          .where("c.created_at >= :start AND c.created_at < :end", { start, end });
        if (filter) qb.andWhere("c.collateral_symbol_id = :symbolId", { symbolId: filter });
        const row = await qb.getRawOne<{ credit: string; collateral: string }>();
        return { primary: Number(row?.credit) || 0, secondary: Number(row?.collateral) || 0 };
      }
      case DashboardMetric.INVENTORY: {
        const base = this.packets
          .createQueryBuilder("p")
          .where("p.created_at >= :start AND p.created_at < :end", { start, end });
        if (filter) base.andWhere("p.warehouse_id = :warehouseId", { warehouseId: filter });
        const [primary, secondary] = await Promise.all([
          base.clone().getCount(),
          base.clone().andWhere("p.is_orphan = true").getCount(),
        ]);
        return { primary, secondary };
      }
    }
  }

  // ── Distribution ────────────────────────────────────────────────────────

  async distribution(metric: DashboardMetric, filter?: string): Promise<DashboardDistributionDto> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
    const scope = this.normalizeFilter(metric, filter);

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
        const qb = this.orders
          .createQueryBuilder("o")
          .leftJoin("o.pricePair", "pair")
          .leftJoin("pair.baseSymbol", "base")
          .select("COALESCE(base.slug, 'نامشخص')", "key")
          .addSelect("COALESCE(SUM(o.total_value), 0)", "value")
          .where("o.created_at >= :since", { since })
          .groupBy("base.slug");
        if (scope) {
          qb.andWhere("base.symbolType = :symbolType", {
            symbolType: CATEGORY_SYMBOL_TYPE[scope as DashboardVolumeCategory],
          });
        }
        const rows = await qb.getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          scope ? `سهم نمادها — ${CATEGORY_LABELS[scope as DashboardVolumeCategory]}` : "سهم نمادها",
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
        const qb = this.withdraws
          .createQueryBuilder("w")
          .select("w.status", "key")
          .addSelect("COUNT(*)", "value")
          .where("w.created_at >= :since", { since })
          .groupBy("w.status");
        if (scope) {
          qb.andWhere("w.type = :type", {
            type: WITHDRAW_CHANNEL_TYPES[scope as DashboardWithdrawChannel],
          });
        }
        const rows = await qb.getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "وضعیت برداشت‌ها",
          rows.map((r) => ({ label: WITHDRAW_STATUS_LABELS[r.key] ?? r.key, value: Number(r.value) })),
        );
      }
      case DashboardMetric.PROVIDERS: {
        // Buy against sell, as a share — what the operator wants from this pie
        // is which way a provider's flow leans, not its absolute size.
        const keys = scope ? await this.providerKeysForPair(scope) : null;
        const qb = this.dealSnapshots
          .createQueryBuilder("d")
          .select("d.provider_key", "key")
          .addSelect("COALESCE(SUM(d.buy_value + d.sell_value), 0)", "value")
          .groupBy("d.provider_key");
        if (keys) {
          if (keys.length === 0) return { title: "سهم تأمین‌کنندگان", slices: [] };
          qb.where("d.provider_key IN (:...keys)", { keys });
        }
        const rows = await qb.getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "سهم تأمین‌کنندگان از خرید و فروش",
          rows.map((r) => ({ label: r.key, value: Number(r.value) })),
        );
      }
      case DashboardMetric.TRADES: {
        const qb = this.orders
          .createQueryBuilder("o")
          .select("o.order_type", "key")
          .addSelect("COUNT(*)", "value")
          .where("o.created_at >= :since", { since })
          .groupBy("o.order_type");
        if (scope) qb.andWhere("o.order_type = :type", { type: scope });
        const rows = await qb.getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "سهم انواع سفارش",
          rows.map((r) => ({ label: ORDER_TYPE_LABELS[r.key] ?? r.key, value: Number(r.value) })),
        );
      }
      case DashboardMetric.CREDITS: {
        // Credit against the collateral standing behind it: the ratio is the
        // whole risk picture, and a pie of two wedges says it at a glance.
        const rows = await this.collateralRows(scope);
        const credit = rows.reduce((sum, r) => sum + (Number(r.usedCredit) || 0), 0);
        const collateral = rows.reduce(
          (sum, r) => sum + (Number(r.currentCollateralValue) || 0),
          0,
        );
        return this.toDistribution("اعتبار در برابر وثیقه", [
          { label: "اعتبار استفاده‌شده", value: credit },
          { label: "ارزش وثیقه", value: collateral },
        ]);
      }
      case DashboardMetric.INVENTORY: {
        const qb = this.packets
          .createQueryBuilder("p")
          .select("p.status", "key")
          .addSelect("COALESCE(SUM(p.pure_weight), 0)", "value")
          .groupBy("p.status");
        if (scope) qb.where("p.warehouse_id = :warehouseId", { warehouseId: scope });
        const rows = await qb.getRawMany<{ key: string; value: string }>();
        return this.toDistribution(
          "وزن بسته‌ها بر پایه وضعیت",
          rows.map((r) => ({ label: PACKET_STATUS_LABELS[r.key] ?? r.key, value: Number(r.value) })),
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

  async activity(
    metric: DashboardMetric,
    limit = 5,
    filter?: string
  ): Promise<DashboardActivityItemDto[]> {
    const scope = this.normalizeFilter(metric, filter);
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
        const qb = this.orders
          .createQueryBuilder("o")
          .leftJoinAndSelect("o.user", "user")
          .leftJoinAndSelect("o.pricePair", "pair")
          .leftJoinAndSelect("pair.baseSymbol", "base")
          .leftJoinAndSelect("pair.quoteSymbol", "quote")
          .orderBy("o.created_at", "DESC")
          .take(limit);
        if (scope) {
          qb.where("base.symbolType = :symbolType", {
            symbolType: CATEGORY_SYMBOL_TYPE[scope as DashboardVolumeCategory],
          });
        }
        const rows = await qb.getMany();
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
          where: scope
            ? ({ type: WITHDRAW_CHANNEL_TYPES[scope as DashboardWithdrawChannel] } as any)
            : undefined,
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
      case DashboardMetric.PROVIDERS: {
        // Last status change is the provider's own timeline: when it went
        // active, when it dropped out. That is the feed an operator watches.
        const keys = scope ? await this.providerKeysForPair(scope) : null;
        const rows = await this.providers.find({ order: { lastStatusChangeAt: "DESC" } as any });
        return rows
          .filter((p) => !keys || keys.includes(p.key))
          .slice(0, limit)
          .map((p) => ({
            id: p.id,
            title: `${p.persianName ?? p.key} — ${p.status}`,
            description: p.active ? "فعال" : "غیرفعال",
            severity: p.active
              ? DashboardSeverity.GOOD
              : p.status === "error"
                ? DashboardSeverity.BAD
                : DashboardSeverity.WARN,
            at: (p as any).lastStatusChangeAt ?? p.updateAt ?? p.createAt,
          }));
      }
      case DashboardMetric.TRADES: {
        const rows = await this.orders.find({
          where: scope ? ({ orderType: scope } as any) : undefined,
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
        });
        return rows.map((o: any) => ({
          id: o.id,
          title: `${ORDER_TYPE_LABELS[o.orderType] ?? o.orderType} — ${o.status}`,
          description: `${this.personName(o.user)} — ${o.quantity ?? 0} ${this.pairLabel(o.pricePair)}`,
          severity: this.orderSeverity(o.status),
          at: o.createAt,
        }));
      }
      case DashboardMetric.CREDITS: {
        const qb = this.credits
          .createQueryBuilder("c")
          .leftJoinAndSelect("c.user", "user")
          .leftJoinAndSelect("c.collateralSymbol", "collateralSymbol")
          .orderBy("c.created_at", "DESC")
          .take(limit);
        if (scope) qb.where("c.collateral_symbol_id = :symbolId", { symbolId: scope });
        const rows = await qb.getMany();
        return rows.map((c: any) => ({
          id: c.id,
          title: `اعتبار ${c.creditCode} — ${CREDIT_STATUS_LABELS[c.status] ?? c.status}`,
          description:
            `${this.personName(c.user)} — وثیقه ${c.collateralAmount} ` +
            `${c.collateralSymbol?.slug ?? ""}`.trim(),
          severity:
            c.status === CreditStatusEnum.ACTIVE
              ? DashboardSeverity.GOOD
              : c.hasCallMargin || c.status === CreditStatusEnum.SUSPENDED
                ? DashboardSeverity.BAD
                : DashboardSeverity.INFO,
          at: c.createAt,
        }));
      }
      case DashboardMetric.INVENTORY: {
        const qb = this.packets
          .createQueryBuilder("p")
          .leftJoinAndSelect("p.warehouse", "warehouse")
          .orderBy("p.created_at", "DESC")
          .take(limit);
        if (scope) qb.where("p.warehouse_id = :warehouseId", { warehouseId: scope });
        const rows = await qb.getMany();
        return rows.map((p: any) => ({
          id: p.id,
          title: `بسته ${p.idSecure} — ${PACKET_STATUS_LABELS[p.status] ?? p.status}`,
          description: `${p.pureWeight} گرم — ${p.warehouse?.name ?? "بدون انبار"}`,
          severity: p.isOrphan
            ? DashboardSeverity.BAD
            : p.status === PacketStatusEnum.IN_WAREHOUSE
              ? DashboardSeverity.GOOD
              : DashboardSeverity.INFO,
          at: p.createAt,
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
  async health(metric: DashboardMetric, filter?: string): Promise<DashboardHealthDto> {
    const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
    const scope = this.normalizeFilter(metric, filter);

    const compose = (
      title: string,
      counts: { label: string; count: number; good?: boolean; bad?: boolean }[],
      measures: DashboardStatDto[] = [],
    ): DashboardHealthDto => {
      const total = counts.reduce((s, c) => s + c.count, 0);
      return {
        title,
        windowDays: WINDOW_DAYS,
        measures,
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
      case DashboardMetric.VOLUME:
      case DashboardMetric.TRADES: {
        const rows = await this.orderStatusCounts(since, metric, scope);
        const latency = await this.averageSettlementSeconds(since, metric, scope);
        return compose(
          "سلامت موتور معاملات",
          rows.map((r) => ({
            label: r.key,
            count: r.count,
            good: r.key === "COMPLETED",
            bad: r.key.includes("CANCEL") || r.key.includes("REJECT") || r.key.includes("FAIL"),
          })),
          [
            {
              label: "میانگین تأخیر تسویه",
              // Null when nothing completed in the window: an average of no
              // samples is not zero seconds, it is unknown.
              value: latency === null ? "—" : latency.toFixed(1),
              unit: null,
              hint: latency === null ? "معامله تکمیل‌شده‌ای نبوده" : "ثانیه، از ثبت تا تکمیل",
            },
          ],
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
        const type = scope
          ? WITHDRAW_CHANNEL_TYPES[scope as DashboardWithdrawChannel]
          : undefined;
        const [rows, paid, pending] = await Promise.all([
          this.withdrawStatusCounts(since, type),
          this.withdrawSumBetween(since, new Date(), WithdrawStatusEnum.COMPLETED, type),
          this.withdrawSum(WithdrawStatusEnum.PENDING, type),
        ]);
        return compose(
          "سلامت سیستم پرداخت",
          rows.map((r) => ({
            label: WITHDRAW_STATUS_LABELS[r.key] ?? r.key,
            count: r.count,
            good: r.key === WithdrawStatusEnum.COMPLETED,
            bad: r.key === WithdrawStatusEnum.FAILED,
          })),
          [
            {
              label: "پرداخت‌شده",
              value: paid.toFixed(2),
              unit: RIAL_SYMBOL_SLUG,
              hint: `${WINDOW_DAYS} روز`,
            },
            { label: "در صف پرداخت", value: pending.toFixed(2), unit: RIAL_SYMBOL_SLUG },
          ],
        );
      }
      case DashboardMetric.PROVIDERS: {
        const keys = scope ? await this.providerKeysForPair(scope) : null;
        const all = await this.providers.find();
        const scoped = keys ? all.filter((p) => keys.includes(p.key)) : all;
        const byStatus = new Map<string, number>();
        for (const provider of scoped) {
          const key = provider.active ? "فعال" : (provider.status ?? "inactive");
          byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
        }
        return compose(
          "وضعیت تأمین‌کنندگان",
          [...byStatus].map(([label, count]) => ({
            label,
            count,
            good: label === "فعال",
            bad: label === "error",
          })),
        );
      }
      case DashboardMetric.CREDITS: {
        const rows = await this.credits
          .createQueryBuilder("c")
          .select("c.status", "key")
          .addSelect("COUNT(*)", "count")
          .where(scope ? "c.collateral_symbol_id = :symbolId" : "1=1", { symbolId: scope })
          .groupBy("c.status")
          .getRawMany<{ key: string; count: string }>();
        const open = await this.collateralRows(scope);
        // Accumulated loss, in the credit's own base value: the number that
        // decides whether the book is under water, not a per-line figure.
        const loss = open.reduce((sum, r) => {
          const initial = Number(r.initialCollateralValue) || 0;
          const current = Number(r.currentCollateralValue) || 0;
          return sum + Math.max(0, initial - current);
        }, 0);
        const callMargin = open.filter((r) => (r as any).hasCallMargin).length;
        return compose(
          "وضعیت اعتبارها",
          rows.map((r) => ({
            label: CREDIT_STATUS_LABELS[r.key] ?? r.key,
            count: Number(r.count),
            good: r.key === CreditStatusEnum.SETTLED || r.key === CreditStatusEnum.ACTIVE,
            bad: r.key === CreditStatusEnum.SUSPENDED || r.key === CreditStatusEnum.EXPIRED,
          })),
          [
            { label: "زیان انباشته وثیقه", value: loss.toFixed(2), unit: RIAL_SYMBOL_SLUG },
            { label: "در وضعیت کال‌مارجین", value: String(callMargin), unit: null },
          ],
        );
      }
      case DashboardMetric.INVENTORY: {
        const qb = this.packets
          .createQueryBuilder("p")
          .select("p.status", "key")
          .addSelect("COUNT(*)", "count")
          .groupBy("p.status");
        if (scope) qb.where("p.warehouse_id = :warehouseId", { warehouseId: scope });
        const rows = await qb.getRawMany<{ key: string; count: string }>();
        const [total, orphan] = await Promise.all([
          this.packetTotals(scope),
          this.packetTotals(scope, { orphan: true }),
        ]);
        return compose(
          "وضعیت انبار",
          rows.map((r) => ({
            label: PACKET_STATUS_LABELS[r.key] ?? r.key,
            count: Number(r.count),
            good: r.key === PacketStatusEnum.IN_WAREHOUSE,
            bad: r.key === PacketStatusEnum.ORPHAN,
          })),
          [
            { label: "وزن کل", value: total.weight.toFixed(3), unit: null, hint: "گرم" },
            { label: "وزن بی‌صاحب", value: orphan.weight.toFixed(3), unit: null, hint: "گرم" },
          ],
        );
      }
    }
  }

  /** Order status counts, narrowed the way the calling card is narrowed. */
  private async orderStatusCounts(
    since: Date,
    metric: DashboardMetric,
    scope?: string
  ): Promise<{ key: string; count: number }[]> {
    const qb = this.orders
      .createQueryBuilder("o")
      .select("o.status", "key")
      .addSelect("COUNT(*)", "count")
      .where("o.created_at >= :since", { since })
      .groupBy("o.status");
    if (scope && metric === DashboardMetric.TRADES) {
      qb.andWhere("o.order_type = :type", { type: scope });
    }
    if (scope && metric === DashboardMetric.VOLUME) {
      qb.leftJoin("o.pricePair", "pair")
        .leftJoin("pair.baseSymbol", "base")
        .andWhere("base.symbolType = :symbolType", {
          symbolType: CATEGORY_SYMBOL_TYPE[scope as DashboardVolumeCategory],
        });
    }
    const rows = await qb.getRawMany<{ key: string; count: string }>();
    return rows.map((r) => ({ key: String(r.key), count: Number(r.count) }));
  }

  private async withdrawStatusCounts(
    since: Date,
    type?: string
  ): Promise<{ key: string; count: number }[]> {
    const qb = this.withdraws
      .createQueryBuilder("w")
      .select("w.status", "key")
      .addSelect("COUNT(*)", "count")
      .where("w.created_at >= :since", { since })
      .groupBy("w.status");
    if (type) qb.andWhere("w.type = :type", { type });
    const rows = await qb.getRawMany<{ key: string; count: string }>();
    return rows.map((r) => ({ key: String(r.key), count: Number(r.count) }));
  }

  /**
   * Mean seconds from an order being placed to it completing.
   *
   * Only completed orders have a latency at all: one still pending has not
   * finished taking however long it will take, and counting it as its age so
   * far would drag the mean toward whatever is currently stuck.
   */
  private async averageSettlementSeconds(
    since: Date,
    metric: DashboardMetric,
    scope?: string
  ): Promise<number | null> {
    const qb = this.orders
      .createQueryBuilder("o")
      .select("AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)))", "avg")
      .where("o.created_at >= :since", { since })
      .andWhere("o.completed_at IS NOT NULL");
    if (scope && metric === DashboardMetric.TRADES) {
      qb.andWhere("o.order_type = :type", { type: scope });
    }
    if (scope && metric === DashboardMetric.VOLUME) {
      qb.leftJoin("o.pricePair", "pair")
        .leftJoin("pair.baseSymbol", "base")
        .andWhere("base.symbolType = :symbolType", {
          symbolType: CATEGORY_SYMBOL_TYPE[scope as DashboardVolumeCategory],
        });
    }
    const row = await qb.getRawOne<{ avg: string | null }>();
    return row?.avg === null || row?.avg === undefined ? null : Number(row.avg);
  }

  // ── Recent table ────────────────────────────────────────────────────────

  async recent(
    metric: DashboardMetric,
    limit = 5,
    filter?: string
  ): Promise<DashboardRecentDto> {
    const scope = this.normalizeFilter(metric, filter);
    switch (metric) {
      case DashboardMetric.USERS: {
        const rows = await this.users.find({ order: { createAt: "DESC" }, take: limit });
        return {
          title: "آخرین کاربران",
          columns: ["شناسه", "کاربر", "موبایل", "نقش", "پیوستن"],
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.TEXT, K.DATE],
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
          // Quantity is base units (gold grams); value is the pair's quote.
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.TEXT, K.QUANTITY, K.MONEY],
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
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.MONEY, K.TEXT],
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
          where: {
            status: WithdrawStatusEnum.PENDING,
            ...(scope
              ? { type: WITHDRAW_CHANNEL_TYPES[scope as DashboardWithdrawChannel] }
              : {}),
          } as any,
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, symbol: true } as any,
        });
        return {
          title: "برداشت‌های در انتظار",
          columns: ["شناسه", "کاربر", "نماد", "مبلغ", "نوع", "زمان"],
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.MONEY, K.TEXT, K.DATE],
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

      case DashboardMetric.PROVIDERS: {
        const keys = scope ? await this.providerKeysForPair(scope) : null;
        const snapshots = await this.dealSnapshots
          .createQueryBuilder("d")
          .select("d.provider_key", "providerKey")
          .addSelect("COALESCE(SUM(d.deal_count), 0)", "deals")
          .addSelect("COALESCE(SUM(d.buy_value), 0)", "buyValue")
          .addSelect("COALESCE(SUM(d.sell_value), 0)", "sellValue")
          .addSelect("MAX(d.last_deal_at)", "lastDealAt")
          .groupBy("d.provider_key")
          .getRawMany<{
            providerKey: string;
            deals: string;
            buyValue: string;
            sellValue: string;
            lastDealAt: Date | null;
          }>();
        const providers = await this.providers.find();
        const scoped = providers.filter((p) => !keys || keys.includes(p.key)).slice(0, limit);
        return {
          title: "تأمین‌کنندگان",
          columns: ["کلید", "وضعیت", "معامله", "ارزش خرید", "ارزش فروش", "آخرین معامله"],
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.MONEY, K.MONEY, K.DATE],
          unit: RIAL_SYMBOL_SLUG,
          rows: scoped.map((p) => {
            const row = snapshots.find((d) => d.providerKey === p.key);
            return {
              id: p.id,
              cells: [
                p.key,
                p.active ? "فعال" : "غیرفعال",
                String(Number(row?.deals ?? 0)),
                String(row?.buyValue ?? "0"),
                String(row?.sellValue ?? "0"),
                row?.lastDealAt ? new Date(row.lastDealAt).toISOString() : "",
              ],
              status: p.status ?? null,
            };
          }),
        };
      }

      case DashboardMetric.TRADES: {
        const rows = await this.orders.find({
          where: scope ? ({ orderType: scope } as any) : undefined,
          order: { createAt: "DESC" },
          take: limit,
          relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
        });
        return {
          title: "آخرین سفارش‌ها",
          columns: ["شناسه", "نوع", "کاربر", "سمت", "جفت‌ارز", "مقدار", "ارزش"],
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.TEXT, K.TEXT, K.QUANTITY, K.MONEY],
          unit: RIAL_SYMBOL_SLUG,
          rows: rows.map((o: any) => ({
            id: o.id,
            cells: [
              o.orderCode ?? o.id.slice(0, 8),
              ORDER_TYPE_LABELS[o.orderType] ?? o.orderType,
              this.personName(o.user),
              o.side === "BUY" ? "خرید" : "فروش",
              this.pairLabel(o.pricePair),
              String(o.quantity ?? ""),
              String(o.totalValue ?? ""),
            ],
            status: o.status,
          })),
        };
      }

      case DashboardMetric.CREDITS: {
        const qb = this.credits
          .createQueryBuilder("c")
          .leftJoinAndSelect("c.user", "user")
          .leftJoinAndSelect("c.collateralSymbol", "collateralSymbol")
          .orderBy("c.created_at", "DESC")
          .take(limit);
        if (scope) qb.where("c.collateral_symbol_id = :symbolId", { symbolId: scope });
        const rows = await qb.getMany();
        return {
          title: "اعتبارهای اخیر",
          columns: ["کد", "کاربر", "اعتبار", "وثیقه", "نماد وثیقه", "ارزش فعلی وثیقه", "سررسید"],
          columnKinds: [K.TEXT, K.TEXT, K.MONEY, K.QUANTITY, K.TEXT, K.MONEY, K.DATE],
          unit: RIAL_SYMBOL_SLUG,
          rows: rows.map((c: any) => ({
            id: c.id,
            cells: [
              c.creditCode,
              this.personName(c.user),
              String(c.usedCredit ?? c.amount ?? ""),
              String(c.collateralAmount ?? ""),
              c.collateralSymbol?.slug ?? "",
              String(c.currentCollateralValue ?? ""),
              c.expireAt ? new Date(c.expireAt).toISOString() : "",
            ],
            status: c.status,
          })),
        };
      }

      case DashboardMetric.INVENTORY: {
        const qb = this.packets
          .createQueryBuilder("p")
          .leftJoinAndSelect("p.warehouse", "warehouse")
          .leftJoinAndSelect("p.user", "user")
          .orderBy("p.created_at", "DESC")
          .take(limit);
        if (scope) qb.where("p.warehouse_id = :warehouseId", { warehouseId: scope });
        const rows = await qb.getMany();
        return {
          title: "بسته‌های اخیر",
          columns: ["شناسه", "انبار", "مالک", "وزن خالص", "بی‌صاحب", "ثبت"],
          columnKinds: [K.TEXT, K.TEXT, K.TEXT, K.QUANTITY, K.TEXT, K.DATE],
          unit: null,
          rows: rows.map((p: any) => ({
            id: p.id,
            cells: [
              p.idSecure,
              p.warehouse?.name ?? "",
              this.personName(p.user),
              String(p.pureWeight ?? ""),
              p.isOrphan ? "بله" : "خیر",
              p.createAt?.toISOString() ?? "",
            ],
            status: p.status,
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

  /**
   * Executed value of orders, in the pair's quote — Rial for a Rial-quoted
   * pair, which is every pair the dashboard reports on.
   *
   * Value rather than quantity, because a category spans several symbols:
   * adding grams of gold to coins to grams of silver produces a number that
   * looks like a total and is not one. Value is comparable across all of them.
   */
  private async orderValue(
    from: Date,
    to: Date,
    category?: DashboardVolumeCategory,
    side?: "BUY" | "SELL"
  ): Promise<number> {
    const qb = this.orders
      .createQueryBuilder("o")
      .select("COALESCE(SUM(o.total_value), 0)", "total")
      .where("o.created_at >= :from AND o.created_at < :to", { from, to });
    if (side) qb.andWhere("o.side = :side", { side });
    if (category) {
      qb.leftJoin("o.pricePair", "pair")
        .leftJoin("pair.baseSymbol", "base")
        .andWhere("base.symbolType = :symbolType", {
          symbolType: CATEGORY_SYMBOL_TYPE[category],
        });
    }
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async orderCount(
    from: Date,
    to: Date,
    type?: OrderTypeEnum,
    statuses?: OrderStatusEnum[]
  ): Promise<number> {
    const qb = this.orders
      .createQueryBuilder("o")
      .where("o.created_at >= :from AND o.created_at < :to", { from, to });
    if (type) qb.andWhere("o.order_type = :type", { type });
    if (statuses?.length) qb.andWhere("o.status IN (:...statuses)", { statuses });
    return qb.getCount();
  }

  /** Ledger movement, optionally only for symbols of one category. */
  private async ledgerSum(
    from: Date,
    to: Date,
    category?: DashboardVolumeCategory
  ): Promise<number> {
    const qb = this.ledger
      .createQueryBuilder("l")
      .select("COALESCE(SUM(l.amount), 0)", "total")
      .where("l.created_at >= :from AND l.created_at < :to", { from, to });
    if (category) {
      qb.leftJoin("l.symbol", "s").andWhere("s.symbolType = :symbolType", {
        symbolType: CATEGORY_SYMBOL_TYPE[category],
      });
    }
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  /** Income before the adjustments against it — the positive side only. */
  private async grossLedger(from: Date, to: Date): Promise<number> {
    const { total } = await this.ledger
      .createQueryBuilder("l")
      .select("COALESCE(SUM(l.amount), 0)", "total")
      .where("l.created_at >= :from AND l.created_at < :to", { from, to })
      .andWhere("l.amount > 0")
      .getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async withdrawCount(status?: WithdrawStatusEnum, type?: string): Promise<number> {
    const qb = this.withdraws.createQueryBuilder("w");
    if (status) qb.andWhere("w.status = :status", { status });
    if (type) qb.andWhere("w.type = :type", { type });
    return qb.getCount();
  }

  private async withdrawSum(status?: WithdrawStatusEnum, type?: string): Promise<number> {
    const qb = this.withdraws
      .createQueryBuilder("w")
      .select("COALESCE(SUM(w.amount), 0)", "total");
    if (status) qb.andWhere("w.status = :status", { status });
    if (type) qb.andWhere("w.type = :type", { type });
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  private async withdrawSumBetween(
    from: Date,
    to: Date,
    status?: WithdrawStatusEnum,
    type?: string
  ): Promise<number> {
    const qb = this.withdraws
      .createQueryBuilder("w")
      .select("COALESCE(SUM(w.amount), 0)", "total")
      .where("w.created_at >= :from AND w.created_at < :to", { from, to });
    if (status) qb.andWhere("w.status = :status", { status });
    if (type) qb.andWhere("w.type = :type", { type });
    const { total } = await qb.getRawOne<{ total: string }>();
    return Number(total) || 0;
  }

  /** Providers mapped to one price pair, which is what "for this pair" means. */
  private async providerKeysForPair(pairId: string): Promise<string[]> {
    const rows = await this.mappings.find({ where: { pairId } });
    return [...new Set(rows.map((r) => r.providerKey))];
  }

  /** Credit lines still holding collateral, optionally in one symbol. */
  private async collateralRows(symbolId?: string): Promise<CreditEntity[]> {
    const qb = this.credits
      .createQueryBuilder("c")
      .where("c.status IN (:...statuses)", {
        statuses: [CreditStatusEnum.ACTIVE, CreditStatusEnum.SUSPENDED],
      })
      .andWhere("c.collateral_amount > 0");
    if (symbolId) qb.andWhere("c.collateral_symbol_id = :symbolId", { symbolId });
    return qb.getMany();
  }

  /**
   * Packet count and pure weight together: an operator asked "how much is in
   * the warehouse" means both, and a count of packets alone says nothing about
   * how much metal it is.
   */
  private async packetTotals(
    warehouseId?: string,
    scope?: { status?: PacketStatusEnum; orphan?: boolean }
  ): Promise<{ count: number; weight: number }> {
    const qb = this.packets
      .createQueryBuilder("p")
      .select("COUNT(*)", "count")
      .addSelect("COALESCE(SUM(p.pure_weight), 0)", "weight");
    if (warehouseId) qb.andWhere("p.warehouse_id = :warehouseId", { warehouseId });
    if (scope?.status) qb.andWhere("p.status = :status", { status: scope.status });
    if (scope?.orphan) qb.andWhere("p.is_orphan = true");
    const row = await qb.getRawOne<{ count: string; weight: string }>();
    return { count: Number(row?.count) || 0, weight: Number(row?.weight) || 0 };
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
