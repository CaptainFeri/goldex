import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { ProviderSettlementEntity, SettlementDirection } from "./entity/provider-settlement.entity";
import { SettleDto } from "./dto/settle.dto";

// Signed contribution of a settlement to the running balance:
//  RECEIVE (we take the asset from the provider) reduces what they owe us → negative.
//  PAY     (we give the asset to the provider)   reduces what we owe them → positive.
function signedSettlement(direction: SettlementDirection, amount: number): number {
  return direction === SettlementDirection.RECEIVE ? -amount : amount;
}

@Injectable()
export class ProviderFinanceService {
  constructor(
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly dealRepo: Repository<ProviderDealSnapshotEntity>,
    @InjectRepository(ProviderSettlementEntity)
    private readonly settlementRepo: Repository<ProviderSettlementEntity>,
    @InjectRepository(SystemLedgerEntity)
    private readonly ledgerRepo: Repository<SystemLedgerEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
  ) {}

  // Accrued platform profit per provider, per symbol, from the system ledger.
  private async profitByProvider(): Promise<Map<string, Map<string, number>>> {
    const rows = await this.ledgerRepo
      .createQueryBuilder("l")
      .select("l.provider_key", "providerKey")
      .addSelect("l.symbol_id", "symbolId")
      .addSelect("SUM(l.amount)", "total")
      .where("l.provider_key IS NOT NULL")
      .groupBy("l.provider_key")
      .addGroupBy("l.symbol_id")
      .getRawMany();
    const symbols = await this.symbolRepo.find();
    const slugById = new Map(symbols.map((s) => [s.id, s.slug]));
    const map = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const slug = slugById.get(r.symbolId) ?? "XAU";
      if (!map.has(r.providerKey)) map.set(r.providerKey, new Map());
      const m = map.get(r.providerKey)!;
      m.set(slug, (m.get(slug) ?? 0) + Number(r.total));
    }
    return map;
  }

  /**
   * Per-provider, per-symbol balance:
   *   traded   = cumulative position from deals (base=netVolume, quote=netValue)
   *   settled  = signed sum of admin settlements
   *   outstanding = traded + settled
   *     > 0 → bedehkar  (provider owes us)
   *     < 0 → bestankar (we owe the provider)
   */
  async getOverview() {
    const deals = await this.dealRepo.find();
    const settlements = await this.settlementRepo.find();
    const profit = await this.profitByProvider();

    const map = new Map<string, Map<string, { traded: number; settled: number }>>();
    const cell = (provider: string, symbol: string) => {
      if (!map.has(provider)) map.set(provider, new Map());
      const m = map.get(provider)!;
      if (!m.has(symbol)) m.set(symbol, { traded: 0, settled: 0 });
      return m.get(symbol)!;
    };

    for (const d of deals) {
      // Each snapshot row is per (provider, item) with its resolved pair
      // symbols; unmapped/legacy rows fall back to XAU/IRR.
      const base = d.baseSymbol ?? "XAU";
      const quote = d.quoteSymbol ?? "IRR";
      cell(d.providerKey, base).traded += Number(d.netVolume);
      cell(d.providerKey, quote).traded += Number(d.netValue);
    }
    for (const s of settlements) {
      cell(s.providerKey, s.symbol).settled += signedSettlement(s.direction, Number(s.amount));
    }
    // Ensure providers that only have accrued profit still appear.
    for (const provider of profit.keys()) {
      if (!map.has(provider)) map.set(provider, new Map());
    }

    return [...map.entries()]
      .map(([providerKey, syms]) => ({
        providerKey,
        symbols: [...syms.entries()]
          .map(([symbol, v]) => {
            const outstanding = Number((v.traded + v.settled).toFixed(8));
            return {
              symbol,
              traded: Number(v.traded.toFixed(8)),
              settled: Number(v.settled.toFixed(8)),
              outstanding,
              bedehkar: outstanding > 0 ? outstanding : 0, // provider owes us
              bestankar: outstanding < 0 ? -outstanding : 0, // we owe provider
            };
          })
          .filter((x) => x.traded !== 0 || x.settled !== 0 || x.outstanding !== 0),
        profit: [...(profit.get(providerKey)?.entries() ?? [])].map(([symbol, amount]) => ({
          symbol,
          amount: Number(amount.toFixed(8)),
        })),
      }))
      .filter((p) => p.symbols.length > 0 || p.profit.length > 0)
      .sort((a, b) => a.providerKey.localeCompare(b.providerKey));
  }

  async settle(dto: SettleDto, adminId?: string) {
    const row = this.settlementRepo.create({
      providerKey: dto.providerKey,
      symbol: dto.symbol.toUpperCase(),
      direction: dto.direction,
      amount: dto.amount,
      note: dto.note ?? null,
      adminId: adminId ?? null,
    });
    return await this.settlementRepo.save(row);
  }

  async getSettlements(providerKey?: string) {
    return await this.settlementRepo.find({
      where: providerKey ? { providerKey } : {},
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
}
