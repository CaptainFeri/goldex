import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, In, Repository } from "typeorm";
import { SystemLedgerEntity } from "./entity/system-ledger.entity";
import { ProviderBalanceSnapshotEntity } from "./entity/provider-balance-snapshot.entity";
import { ProviderDealSnapshotEntity } from "./entity/provider-deal-snapshot.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { OrderEntity } from "../order/order.entity";
import { OrderStatusEnum } from "../order/enum/order.status.enum";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";

const PROFIT_INTERVALS = ["hour", "day", "week", "month"] as const;
type ProfitInterval = (typeof PROFIT_INTERVALS)[number];

@Injectable()
export class FinancialService {
  constructor(
    @InjectRepository(SystemLedgerEntity)
    private readonly ledgerRepo: Repository<SystemLedgerEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProviderBalanceSnapshotEntity)
    private readonly providerBalanceRepo: Repository<ProviderBalanceSnapshotEntity>,
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly providerDealRepo: Repository<ProviderDealSnapshotEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(UserKycEntity)
    private readonly kycRepo: Repository<UserKycEntity>
  ) {}

  // Period KPIs with a same-length previous-period comparison.
  async getStats(fromMs: number, toMs: number) {
    const span = Math.max(1, toMs - fromMs);
    const current = await this.computePeriod(new Date(fromMs), new Date(toMs));
    const previous = await this.computePeriod(new Date(fromMs - span), new Date(fromMs));
    return { range: { from: fromMs, to: toMs }, current, previous };
  }

  private async computePeriod(from: Date, to: Date) {
    const inRange = (col: string) => `${col} BETWEEN :from AND :to`;
    const params = { from, to };

    const totalOrders = await this.orderRepo
      .createQueryBuilder("o")
      .where(inRange("o.created_at"), params)
      .getCount();

    const completedOrders = await this.orderRepo
      .createQueryBuilder("o")
      .where("o.status = :s", { s: OrderStatusEnum.COMPLETED })
      .andWhere(inRange("o.created_at"), params)
      .getCount();

    const volRow = await this.orderRepo
      .createQueryBuilder("o")
      .select("COALESCE(SUM(o.quantity),0)", "vol")
      .where("o.status = :s", { s: OrderStatusEnum.COMPLETED })
      .andWhere(inRange("o.created_at"), params)
      .getRawOne();

    const avgRow = await this.orderRepo
      .createQueryBuilder("o")
      .select("AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)))", "avg")
      .where("o.status = :s", { s: OrderStatusEnum.COMPLETED })
      .andWhere("o.completed_at IS NOT NULL")
      .andWhere(inRange("o.completed_at"), params)
      .getRawOne();

    const pendingKyc = await this.kycRepo.count({
      where: { status: KycStatusEnum.PENDING, createAt: Between(from, to) },
    });

    const totalBlocks = await this.userRepo.count({
      where: { blockedAt: Between(from, to) },
    });

    return {
      dealVolume: Number(volRow?.vol) || 0,
      avgDealSeconds: Number(avgRow?.avg) || 0,
      totalOrders,
      completedOrders,
      successRate: totalOrders ? Number(((completedOrders / totalOrders) * 100).toFixed(2)) : 0,
      pendingKyc,
      totalBlocks,
    };
  }

  // All orders (admin-wide), newest first. Served here (under admin/financial/*)
  // because GET /admin/orders is shadowed by admin-management's :id route.
  async getOrders(limit: number, offset: number, fromMs?: number, toMs?: number) {
    const where =
      fromMs != null && toMs != null ? { createAt: Between(new Date(fromMs), new Date(toMs)) } : {};
    const [rows, total] = await this.orderRepo.findAndCount({
      where,
      relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
      order: { createAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return {
      items: rows.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        side: o.side,
        orderType: o.orderType,
        status: o.status,
        quantity: Number(o.quantity),
        price: Number(o.price),
        totalValue: o.totalValue != null ? Number(o.totalValue) : null,
        base: o.pricePair?.baseSymbol?.slug ?? null,
        quote: o.pricePair?.quoteSymbol?.slug ?? null,
        user: o.user ? `${o.user.firstName ?? ""} ${o.user.lastName ?? ""}`.trim() : null,
        createdAt: o.createAt,
      })),
      total,
    };
  }

  // All wallet transactions (admin-wide), newest first, with user/symbol context.
  async getTransactions(limit: number, offset: number, type?: string) {
    const [rows, total] = await this.transactionRepo.findAndCount({
      where: type ? ({ transactionType: type } as any) : undefined,
      relations: { wallet: { user: true, symbol: true } },
      order: { createAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return {
      items: rows.map((t) => ({
        id: t.id,
        transactionId: t.transactionId,
        transactionType: t.transactionType,
        status: t.status,
        amount: Number(t.amount),
        fee: Number(t.fee),
        price: t.price != null ? Number(t.price) : null,
        symbol: t.wallet?.symbol?.slug ?? null,
        user: t.wallet?.user ? `${t.wallet.user.firstName ?? ""} ${t.wallet.user.lastName ?? ""}`.trim() : null,
        orderId: t.orderId ?? null,
        description: t.description ?? null,
        createdAt: t.createAt,
      })),
      total,
    };
  }

  // System ledger entries (the running "system account"), newest first.
  async getLedger(limit: number, offset: number) {
    const [rows, total] = await this.ledgerRepo.findAndCount({
      relations: { symbol: true },
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return {
      items: rows.map((l) => ({
        id: l.id,
        type: l.type,
        amount: Number(l.amount),
        symbol: l.symbol?.slug ?? null,
        orderId: l.orderId ?? null,
        userId: l.userId ?? null,
        description: l.description ?? null,
        createdAt: l.createdAt,
      })),
      total,
    };
  }

  // Latest known balance per provider (mirrored from the pricing-engine), broken
  // out per symbol (gold→XAU, rial→IRR) for the dashboard.
  async getProviderBalances() {
    const rows = await this.providerBalanceRepo.find({ order: { providerKey: "ASC" } });
    return rows.map((r) => {
      const symbols: { symbol: string; value: number }[] = [];
      if (r.goldBalance != null) symbols.push({ symbol: "XAU", value: Number(r.goldBalance) });
      if (r.rialBalance != null) symbols.push({ symbol: RIAL_SYMBOL_SLUG, value: Number(r.rialBalance) });
      return {
        providerKey: r.providerKey,
        goldBalance: r.goldBalance != null ? Number(r.goldBalance) : null,
        rialBalance: r.rialBalance != null ? Number(r.rialBalance) : null,
        symbols,
        updatedAt: r.updatedAt,
      };
    });
  }

  // Provider balances computed from COMPLETED deals (dealStatus=1), mirrored from
  // the pricing-engine over RabbitMQ.
  async getProviderDeals() {
    const rows = await this.providerDealRepo.find({ order: { providerKey: "ASC" } });
    return rows.map((r) => {
      const netVolume = Number(r.netVolume); // net base asset (e.g. gold)
      const netValue = Number(r.netValue); // net quote asset (e.g. currency)
      const base = r.baseSymbol ?? "XAU";
      const quote = r.quoteSymbol ?? RIAL_SYMBOL_SLUG;
      return {
        providerKey: r.providerKey,
        itemId: r.itemId,
        baseSymbol: base,
        quoteSymbol: quote,
        dealCount: r.dealCount,
        totalVolume: Number(r.totalVolume),
        totalValue: Number(r.totalValue),
        buyVolume: Number(r.buyVolume),
        sellVolume: Number(r.sellVolume),
        buyValue: Number(r.buyValue),
        sellValue: Number(r.sellValue),
        netVolume,
        netValue,
        // Per-symbol provider balance derived from completed deals.
        symbols: [
          { symbol: base, value: netVolume },
          { symbol: quote, value: netValue },
        ],
        lastDealAt: r.lastDealAt,
        updatedAt: r.updatedAt,
      };
    });
  }

  // Per-asset: aggregate customer holdings (free/locked) and accrued system
  // profit. Profit is per-symbol (commissions land in different assets), so
  // there's no single cross-asset total without a valuation step.
  async getSummary() {
    const customerRows = await this.walletRepo
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

    const profitRows = await this.ledgerRepo
      .createQueryBuilder("l")
      .leftJoin("l.symbol", "s")
      .select("s.id", "symbolId")
      .addSelect("s.name", "name")
      .addSelect("s.slug", "slug")
      .addSelect("COALESCE(SUM(l.amount), 0)", "profit")
      .groupBy("s.id")
      .addGroupBy("s.name")
      .addGroupBy("s.slug")
      .getRawMany();

    const map = new Map<string, any>();
    const ensure = (r: any) => {
      let e = map.get(r.symbolId);
      if (!e) {
        e = {
          symbol: { id: r.symbolId, name: r.name, slug: r.slug },
          customerFree: 0,
          customerLocked: 0,
          customerFrozenFree: 0,
          customerFrozenLocked: 0,
          customerFrozen: 0,
          customerTotal: 0,
          systemProfit: 0,
        };
        map.set(r.symbolId, e);
      }
      return e;
    };

    for (const r of customerRows) {
      const e = ensure(r);
      e.customerFree = Number(r.free);
      e.customerLocked = Number(r.locked);
      e.customerFrozenFree = Number(r.frozenFree);
      e.customerFrozenLocked = Number(r.frozenLocked);
      e.customerFrozen = Number(r.frozenFree) + Number(r.frozenLocked);
      e.customerTotal = Number(r.free) + Number(r.locked) + Number(r.frozenFree) + Number(r.frozenLocked);
    }
    for (const r of profitRows) {
      ensure(r).systemProfit = Number(r.profit);
    }

    return {
      assets: [...map.values()],
      providerBalances: await this.getProviderBalances(),
    };
  }

  // Commission revenue bucketed over time (per asset).
  async getProfitOverTime(opts: { from?: string; to?: string; interval?: string }) {
    const interval: ProfitInterval = PROFIT_INTERVALS.includes(opts.interval as ProfitInterval)
      ? (opts.interval as ProfitInterval)
      : "day";
    const to = opts.to ? new Date(opts.to) : new Date();
    const from = opts.from ? new Date(opts.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.ledgerRepo
      .createQueryBuilder("l")
      .leftJoin("l.symbol", "s")
      // interval is validated against a whitelist above — safe to interpolate.
      .select(`DATE_TRUNC('${interval}', l.created_at)`, "bucket")
      .addSelect("s.slug", "symbol")
      .addSelect("COALESCE(SUM(l.amount), 0)", "profit")
      .where("l.created_at BETWEEN :from AND :to", { from, to })
      .groupBy("bucket")
      .addGroupBy("s.slug")
      .orderBy("bucket", "ASC")
      .getRawMany();

    return {
      interval,
      from: from.toISOString(),
      to: to.toISOString(),
      points: rows.map((r) => ({ date: r.bucket, symbol: r.symbol, profit: Number(r.profit) })),
    };
  }

  // Paginated customers with their wallet balances.
  async getCustomers(limit = 50, offset = 0) {
    limit = Math.min(limit, 100);
    const [users, total] = await this.userRepo.findAndCount({
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      take: limit,
      skip: offset,
      order: { createAt: "DESC" },
    });

    const userIds = users.map((u) => u.id);
    const wallets = userIds.length
      ? await this.walletRepo.find({ where: { userId: In(userIds) }, relations: { symbol: true } })
      : [];

    const byUser = new Map<string, any[]>();
    for (const w of wallets) {
      const free = Number(w.freeBalance);
      const locked = Number(w.lockedBalance);
      const list = byUser.get(w.userId) || [];
      list.push({
        symbol: w.symbol?.slug || w.symbol?.name || null,
        free,
        locked,
        total: free + locked,
      });
      byUser.set(w.userId, list);
    }

    return {
      total,
      customers: users.map((u) => ({
        userId: u.id,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || null,
        phone: u.phone,
        email: u.email,
        wallets: byUser.get(u.id) || [],
      })),
    };
  }
}
