import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AccountingSettingEntity } from "./entity/accounting-setting.entity";
import { ValuationBasisEnum } from "./enum/valuation-basis.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";

export interface AccountingSettings {
  /**
   * The "pricing symbol": every figure on the accounting page is converted
   * into this asset at live prices. Null until an admin picks one, in which
   * case the Rial symbol is used — the platform's own unit of account.
   */
  referenceSymbolId: string | null;
  /** Which side of the live quote values held assets. */
  valuationBasis: ValuationBasisEnum;
  /** A quote older than this is still used, but reported as stale. */
  priceStalenessSeconds: number;
}

export const ACCOUNTING_DEFAULT_SETTINGS: AccountingSettings = {
  referenceSymbolId: null,
  valuationBasis: ValuationBasisEnum.MID,
  priceStalenessSeconds: 120,
};

const SETTINGS_KEY = "accounting";
const CACHE_TTL_MS = 15_000;

@Injectable()
export class AccountingSettingService {
  private readonly logger = new Logger(AccountingSettingService.name);
  private cache: { value: AccountingSettings; at: number } | null = null;

  constructor(
    @InjectRepository(AccountingSettingEntity)
    private readonly repo: Repository<AccountingSettingEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>
  ) {}

  async get(): Promise<AccountingSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const row = await this.repo.findOne({ where: { key: SETTINGS_KEY } });
    const value: AccountingSettings = {
      ...ACCOUNTING_DEFAULT_SETTINGS,
      ...(row?.valueJson ?? {}),
    };
    this.cache = { value, at: Date.now() };
    return value;
  }

  /**
   * The symbol the books are reported in. Falls back to the Rial symbol when
   * no reference has been chosen, because the platform's accounts are Rial —
   * reporting in an arbitrary asset would be worse than reporting in Rial.
   */
  async getReferenceSymbol(): Promise<SymbolEntity> {
    const { referenceSymbolId } = await this.get();

    if (referenceSymbolId) {
      const chosen = await this.symbolRepo.findOne({ where: { id: referenceSymbolId } });
      if (chosen) return chosen;
      this.logger.warn(`reference symbol ${referenceSymbolId} no longer exists; falling back to rial`);
    }

    const rial =
      (await this.symbolRepo.findOne({
        where: { symbolType: SymbolTypeEnum.RIAL, isActive: true },
        order: { createAt: "ASC" },
      })) ??
      (await this.symbolRepo.findOne({
        where: { symbolType: SymbolTypeEnum.RIAL },
        order: { createAt: "ASC" },
      }));
    if (!rial) {
      throw new BadRequestException("ACCOUNTING.NO_REFERENCE_SYMBOL");
    }
    return rial;
  }

  async update(
    patch: Partial<AccountingSettings>,
    adminId?: string
  ): Promise<AccountingSettings> {
    if (patch.referenceSymbolId) {
      const exists = await this.symbolRepo.findOne({ where: { id: patch.referenceSymbolId } });
      if (!exists) throw new BadRequestException("ACCOUNTING.REFERENCE_SYMBOL_NOT_FOUND");
    }
    if (
      patch.priceStalenessSeconds !== undefined &&
      (!Number.isFinite(patch.priceStalenessSeconds) || patch.priceStalenessSeconds <= 0)
    ) {
      throw new BadRequestException("ACCOUNTING.INVALID_STALENESS");
    }

    const current = await this.get();
    const merged: AccountingSettings = { ...current, ...patch };

    await this.repo.save({
      key: SETTINGS_KEY,
      valueJson: merged,
      updatedByAdminId: adminId ?? null,
    });
    this.cache = { value: merged, at: Date.now() };
    return merged;
  }
}
