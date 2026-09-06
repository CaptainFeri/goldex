import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AccountingSettingService } from "./accounting-setting.service";
import { ValuationRate, ValuationService } from "./valuation.service";

/** One asset's contribution to the books, native and converted. */
export interface AssetLine {
  symbol: { id: string; name: string | null; slug: string | null };
  /** Credits to the system in this asset (gross profit). */
  revenue: number;
  /** Debits against the system in this asset, as a positive number. */
  cost: number;
  /** revenue - cost, in this asset. */
  net: number;
  /** Reference units per one unit of this asset, or null when unpriced. */
  rate: number | null;
  rateStale: boolean;
  rateLegs: ValuationRate["legs"];
  revenueInReference: number | null;
  costInReference: number | null;
  netInReference: number | null;
  /** Why this line could not be converted, when it could not be. */
  unpricedReason?: string;
}

/**
 * The accounting view, valued at live prices.
 *
 * Profit is earned in whichever asset the fee was taken in — commission on a
 * gold trade lands in gold — so a cross-asset total only exists once every
 * line is marked to the current market. That is what this service does: it
 * sums the system ledger per asset, then converts each asset into the
 * admin-chosen reference symbol at the live rate.
 *
 * Lines that cannot be priced are never silently dropped or counted as zero;
 * they are returned with a reason so the page can say the total is partial.
 */
@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(SystemLedgerEntity)
    private readonly ledgerRepo: Repository<SystemLedgerEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly settings: AccountingSettingService,
    private readonly valuation: ValuationService
  ) {}

  /**
   * Profit, cost and net profit over a period, per asset and converted into
   * the reference symbol at live prices.
   */
  async getProfitSummary(opts: { from?: Date; to?: Date } = {}) {
    const to = opts.to ?? new Date();
    const from = opts.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [settings, reference] = await Promise.all([
      this.settings.get(),
      this.settings.getReferenceSymbol(),
    ]);

    // Split each asset's ledger into credits and debits in one pass; a single
    // SUM would net them out and lose the cost figure entirely.
    const rows = await this.ledgerRepo
      .createQueryBuilder("l")
      .leftJoin("l.symbol", "s")
      .select("s.id", "symbolId")
      .addSelect("s.name", "name")
      .addSelect("s.slug", "slug")
      .addSelect("COALESCE(SUM(CASE WHEN l.amount > 0 THEN l.amount ELSE 0 END), 0)", "revenue")
      .addSelect("COALESCE(SUM(CASE WHEN l.amount < 0 THEN -l.amount ELSE 0 END), 0)", "cost")
      .where("l.created_at BETWEEN :from AND :to", { from, to })
      .groupBy("s.id")
      .addGroupBy("s.name")
      .addGroupBy("s.slug")
      .getRawMany();

    const rates = await this.valuation.getRates(
      rows.map((r) => r.symbolId).filter(Boolean),
      reference.id,
      settings.valuationBasis,
      settings.priceStalenessSeconds
    );

    const assets: AssetLine[] = rows.map((r) => {
      const revenue = Number(r.revenue) || 0;
      const cost = Number(r.cost) || 0;
      const rate = rates.get(r.symbolId);
      const factor = rate?.rate ?? null;

      return {
        symbol: { id: r.symbolId, name: r.name ?? null, slug: r.slug ?? null },
        revenue,
        cost,
        net: revenue - cost,
        rate: factor,
        rateStale: rate?.stale ?? true,
        rateLegs: rate?.legs ?? [],
        revenueInReference: factor === null ? null : revenue * factor,
        costInReference: factor === null ? null : cost * factor,
        netInReference: factor === null ? null : (revenue - cost) * factor,
        unpricedReason: factor === null ? (rate?.reason ?? "no-priced-route") : undefined,
      };
    });

    const priced = assets.filter((a) => a.rate !== null);
    const unpriced = assets.filter((a) => a.rate === null);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      reference: {
        symbolId: reference.id,
        name: reference.name,
        slug: reference.slug,
        /** True when the reference is the default rather than an explicit choice. */
        isDefault: settings.referenceSymbolId !== reference.id,
      },
      valuationBasis: settings.valuationBasis,
      priceStalenessSeconds: settings.priceStalenessSeconds,
      assets,
      totals: {
        revenue: sum(priced.map((a) => a.revenueInReference ?? 0)),
        cost: sum(priced.map((a) => a.costInReference ?? 0)),
        net: sum(priced.map((a) => a.netInReference ?? 0)),
      },
      /**
       * Assets left out of the totals because nothing could price them. A
       * non-empty list means the totals understate the books.
       */
      unpricedAssets: unpriced.map((a) => ({ symbol: a.symbol, reason: a.unpricedReason })),
      /** True when any priced leg is older than the staleness window. */
      stale: priced.some((a) => a.rateStale),
      asOf: new Date().toISOString(),
    };
  }

  /**
   * What the platform holds right now, valued in the reference symbol. The
   * customer side is what the platform owes; the system side is what it has
   * earned and not yet converted.
   */
  async getHoldings() {
    const [settings, reference] = await Promise.all([
      this.settings.get(),
      this.settings.getReferenceSymbol(),
    ]);

    const walletRows = await this.walletRepo
      .createQueryBuilder("w")
      .leftJoin("w.symbol", "s")
      .select("s.id", "symbolId")
      .addSelect("s.name", "name")
      .addSelect("s.slug", "slug")
      .addSelect("COALESCE(SUM(w.freeBalance), 0)", "free")
      .addSelect("COALESCE(SUM(w.lockedBalance), 0)", "locked")
      .addSelect("COALESCE(SUM(w.frozenFreeBalance), 0)", "frozenFree")
      .addSelect("COALESCE(SUM(w.frozenLockedBalance), 0)", "frozenLocked")
      .groupBy("s.id")
      .addGroupBy("s.name")
      .addGroupBy("s.slug")
      .getRawMany();

    const systemRows = await this.ledgerRepo
      .createQueryBuilder("l")
      .select("l.symbol_id", "symbolId")
      .addSelect("COALESCE(SUM(l.amount), 0)", "balance")
      .groupBy("l.symbol_id")
      .getRawMany();
    const systemBySymbol = new Map(systemRows.map((r) => [r.symbolId, Number(r.balance) || 0]));

    const rates = await this.valuation.getRates(
      [...walletRows.map((r) => r.symbolId), ...systemBySymbol.keys()].filter(Boolean),
      reference.id,
      settings.valuationBasis,
      settings.priceStalenessSeconds
    );

    const assets = walletRows.map((r) => {
      const customerTotal =
        (Number(r.free) || 0) +
        (Number(r.locked) || 0) +
        (Number(r.frozenFree) || 0) +
        (Number(r.frozenLocked) || 0);
      const systemBalance = systemBySymbol.get(r.symbolId) ?? 0;
      const factor = rates.get(r.symbolId)?.rate ?? null;

      return {
        symbol: { id: r.symbolId, name: r.name ?? null, slug: r.slug ?? null },
        customerTotal,
        systemBalance,
        rate: factor,
        rateStale: rates.get(r.symbolId)?.stale ?? true,
        customerTotalInReference: factor === null ? null : customerTotal * factor,
        systemBalanceInReference: factor === null ? null : systemBalance * factor,
      };
    });

    return {
      reference: {
        symbolId: reference.id,
        name: reference.name,
        slug: reference.slug,
        isDefault: settings.referenceSymbolId !== reference.id,
      },
      valuationBasis: settings.valuationBasis,
      assets,
      totals: {
        customer: sum(assets.map((a) => a.customerTotalInReference ?? 0)),
        system: sum(assets.map((a) => a.systemBalanceInReference ?? 0)),
      },
      asOf: new Date().toISOString(),
    };
  }

  /** Live conversion rates from every active symbol into the reference. */
  async getRates() {
    const [settings, reference] = await Promise.all([
      this.settings.get(),
      this.settings.getReferenceSymbol(),
    ]);

    const symbols = await this.symbolRepo.find({ where: { isActive: true } });
    const rates = await this.valuation.getRates(
      symbols.map((s) => s.id),
      reference.id,
      settings.valuationBasis,
      settings.priceStalenessSeconds
    );

    return {
      reference: { symbolId: reference.id, name: reference.name, slug: reference.slug },
      valuationBasis: settings.valuationBasis,
      rates: [...rates.values()],
      asOf: new Date().toISOString(),
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
