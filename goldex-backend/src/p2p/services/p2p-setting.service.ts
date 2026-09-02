import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { P2pSettingEntity } from "../entity/p2p-setting.entity";
import { P2pSourcePriorityEnum } from "../enum/p2p.enums";

export interface P2pSettings {
  settlementTimeoutMinutes: number;
  withdrawerResponseTimeoutMinutes: number;
  reservationTtlMinutes: number;
  requestExpiryHours: number;
  sourcePriority: { deposit: P2pSourcePriorityEnum; withdrawal: P2pSourcePriorityEnum };
  matchingWeights: {
    amountFit: number;
    partsFit: number;
    constraints: number;
    age: number;
    priority: number;
    risk: number;
  };
  matchingMaxRetry: number;
  escalation: {
    notifyAdminOnReject: boolean;
    notifyAdminOnNoResponse: boolean;
    requireAdminResolution: boolean;
  };
  twoPersonApprovalThreshold: number;
  allowOverUnderSplit: boolean;
}

/** Appendix A of the spec. Seeded by migration; this is the fallback. */
export const P2P_DEFAULT_SETTINGS: P2pSettings = {
  settlementTimeoutMinutes: 180,
  withdrawerResponseTimeoutMinutes: 30,
  reservationTtlMinutes: 15,
  requestExpiryHours: 48,
  sourcePriority: {
    deposit: P2pSourcePriorityEnum.CUSTOMER_FIRST,
    withdrawal: P2pSourcePriorityEnum.CUSTOMER_FIRST,
  },
  matchingWeights: { amountFit: 40, partsFit: 20, constraints: 20, age: 10, priority: 10, risk: 0 },
  matchingMaxRetry: 3,
  escalation: {
    notifyAdminOnReject: true,
    notifyAdminOnNoResponse: true,
    requireAdminResolution: true,
  },
  twoPersonApprovalThreshold: 5_000_000_000,
  allowOverUnderSplit: false,
};

const SETTINGS_KEY = "p2p";
const CACHE_TTL_MS = 30_000;

@Injectable()
export class P2pSettingService {
  private readonly logger = new Logger(P2pSettingService.name);
  private cache: { value: P2pSettings; at: number } | null = null;

  constructor(
    @InjectRepository(P2pSettingEntity)
    private readonly repo: Repository<P2pSettingEntity>,
  ) {}

  async get(): Promise<P2pSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const row = await this.repo.findOne({ where: { key: SETTINGS_KEY } });
    // Merge one level deep so a partially-seeded row still yields a complete
    // settings object rather than undefined weights.
    const value: P2pSettings = {
      ...P2P_DEFAULT_SETTINGS,
      ...(row?.valueJson ?? {}),
      sourcePriority: {
        ...P2P_DEFAULT_SETTINGS.sourcePriority,
        ...(row?.valueJson?.sourcePriority ?? {}),
      },
      matchingWeights: {
        ...P2P_DEFAULT_SETTINGS.matchingWeights,
        ...(row?.valueJson?.matchingWeights ?? {}),
      },
      escalation: {
        ...P2P_DEFAULT_SETTINGS.escalation,
        ...(row?.valueJson?.escalation ?? {}),
      },
    };

    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(patch: Partial<P2pSettings>, adminId?: string): Promise<P2pSettings> {
    const current = await this.get();
    const next: P2pSettings = {
      ...current,
      ...patch,
      sourcePriority: { ...current.sourcePriority, ...(patch.sourcePriority ?? {}) },
      matchingWeights: { ...current.matchingWeights, ...(patch.matchingWeights ?? {}) },
      escalation: { ...current.escalation, ...(patch.escalation ?? {}) },
    };

    await this.repo.save({ key: SETTINGS_KEY, valueJson: next, updatedByAdminId: adminId });
    this.cache = null;
    this.logger.log(`p2p settings updated by admin ${adminId ?? "system"}`);
    return next;
  }
}
