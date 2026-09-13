import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProviderDealSnapshotEntity } from "../financial/entity/provider-deal-snapshot.entity";
import { SystemLedgerEntity } from "../financial/entity/system-ledger.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { ProviderSettlementEntity, SettlementDirection } from "./entity/provider-settlement.entity";
import { SettleDto } from "./dto/settle.dto";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";
import { AdminAccountingService } from "../admin-accounting/admin-accounting.service";
import {
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSource,
} from "../admin-accounting/accounting.enums";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";
import { WarehouseService } from "../warehouse/service/warehouse.service";
import { WarehouseEvents } from "../shared/constants/events.constants";

// Signed contribution of a settlement to the running balance:
//  RECEIVE (we take the asset from the provider) reduces what they owe us → negative.
//  PAY     (we give the asset to the provider)   reduces what we owe them → positive.
function signedSettlement(direction: SettlementDirection, amount: number): number {
  return direction === SettlementDirection.RECEIVE ? -amount : amount;
}

@Injectable()
export class ProviderFinanceService {
  private readonly logger = new Logger(ProviderFinanceService.name);

  constructor(
    @InjectRepository(ProviderDealSnapshotEntity)
    private readonly dealRepo: Repository<ProviderDealSnapshotEntity>,
    @InjectRepository(ProviderSettlementEntity)
    private readonly settlementRepo: Repository<ProviderSettlementEntity>,
    @InjectRepository(SystemLedgerEntity)
    private readonly ledgerRepo: Repository<SystemLedgerEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly accounting: AdminAccountingService,
    private readonly warehouse: WarehouseService,
    private readonly events: EventEmitter2,
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
      const quote = d.quoteSymbol ?? RIAL_SYMBOL_SLUG;
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

  /**
   * Records a physical settlement with a provider.
   *
   * Two things follow from the row, neither of which used to happen:
   *
   *  - The ledger gets an entry. Metal and money moved between the platform
   *    and a counterparty, and until now nothing in the books said so.
   *  - When the settlement brings material *in*, the warehouse is told. Gold
   *    received from a provider exists the moment it is settled for, but it is
   *    not a package yet and no withdrawal can be served from it until an
   *    operator weighs it and shelves it. Nobody was being told it was waiting.
   */
  async settle(dto: SettleDto, adminId?: string) {
    const symbolSlug = dto.symbol.toUpperCase();
    const symbol = await this.symbolRepo.findOne({ where: { slug: symbolSlug } });

    if (!symbol) {
      throw new BadRequestException(`Unknown symbol: ${symbolSlug}`);
    }

    const row = await this.settlementRepo.save(
      this.settlementRepo.create({
        providerKey: dto.providerKey,
        symbol: symbolSlug,
        direction: dto.direction,
        amount: dto.amount,
        note: dto.note ?? null,
        adminId: adminId ?? null,
      }),
    );

    await this.bookSettlementVoucher(row, symbol, adminId);
    await this.announceUnpackedMaterial(row, symbol);

    return row;
  }

  /**
   * Books the settlement in the ledger.
   *
   * A settlement that cannot be booked is not recorded as having happened:
   * this runs after the row is saved but its failure propagates, because a
   * settlement the books do not know about is the thing the entry exists to
   * prevent.
   *
   * Direction reads from the provider's side of the account, the same way a
   * customer voucher does — material taken in from them increases what the
   * platform owes them, so it books as a deposit.
   */
  private async bookSettlementVoucher(
    row: ProviderSettlementEntity,
    symbol: SymbolEntity,
    adminId?: string,
  ): Promise<void> {
    if (!adminId) {
      // Every route into settle() is admin-authenticated; a settlement with
      // nobody behind it cannot be followed up and must not be booked.
      throw new BadRequestException("SETTLEMENT.ADMIN_REQUIRED");
    }

    await this.accounting.issueSystemVoucher({
      adminId,
      source: VoucherSource.PROVIDER_SETTLEMENT,
      category: VoucherCategory.CUSTOMER_SETTLEMENT,
      movement:
        row.direction === SettlementDirection.RECEIVE ? VoucherMovement.DEPOSIT : VoucherMovement.WITHDRAW,
      symbolId: symbol.id,
      amount: row.amount,
      // A provider is a counterparty, not a platform user, so there is no
      // customer id to hang this on — the key is the identity.
      customerId: null,
      customerName: row.providerKey,
      customerType: CustomerType.FORMAL,
      description: `تسویه با تأمین‌کننده ${row.providerKey} — ${row.amount} ${symbol.slug}`,
      extraDescription: row.note ?? null,
      referenceId: row.id,
    });
  }

  /**
   * Tells the warehouse there is gold on the bench waiting to be packed.
   *
   * Only for material coming in: rial is money rather than something to put on
   * a shelf, and material going out was packed long ago.
   *
   * Never allowed to fail the settlement. The settlement and its ledger entry
   * are the record; a notification that did not send is a missed nudge, and
   * the unpacked balance still shows the work on the warehouse screen.
   */
  private async announceUnpackedMaterial(row: ProviderSettlementEntity, symbol: SymbolEntity): Promise<void> {
    if (symbol.symbolType !== SymbolTypeEnum.MATERIAL) return;
    if (row.direction !== SettlementDirection.RECEIVE) return;

    try {
      const unpackedBalance = await this.warehouse.getUnpackedMaterialFor(row.providerKey);

      this.events.emit(WarehouseEvents.UNPACKED_MATERIAL, {
        providerKey: row.providerKey,
        symbol: symbol.slug,
        amount: new Decimal(row.amount).toNumber(),
        unpackedBalance,
        settlementId: row.id,
      });
    } catch (error) {
      this.logger.warn(
        `Settlement ${row.id} recorded, but the warehouse could not be notified: ${(error as Error).message}`,
      );
    }
  }

  async getSettlements(providerKey?: string) {
    return await this.settlementRepo.find({
      where: providerKey ? { providerKey } : {},
      order: { createdAt: "DESC" },
      take: 200,
    });
  }
}
