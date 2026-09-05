import { Injectable, Logger } from "@nestjs/common";
import { CbpAdminService } from "../cbp-admin/cbp-admin.service";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";
import {
  GATEWAY_BOUND_TYPES,
  SYMBOL_TYPE_DEPOSIT_MAP,
  SYMBOL_TYPE_WITHDRAW_MAP,
  getDefaultDepositGateways,
  getDefaultDepositTypes,
  getDefaultWithdrawGateways,
  getDefaultWithdrawTypes,
  getEligibleGatewayCategories,
} from "./constants/symbol-type-type-map";
import {
  GatewayOption,
  SymbolCapabilities,
  SymbolTypeCapability,
} from "./symbol-capabilities.types";

interface RawGatewayMetadata {
  code?: string;
  name?: string;
  category?: string;
  kind?: string;
}

interface RawGatewayHealth {
  code?: string;
  status?: string;
  message?: string;
}

/** How long a registry read is reused before asking goldex-cbp again. */
const CACHE_TTL_MS = 30_000;

/**
 * Builds the symbol form's capability document: the static per-symbol-type
 * rules plus the gateways actually registered in goldex-cbp, so registering a
 * provider there makes it selectable without an admin-panel release.
 */
@Injectable()
export class SymbolCapabilitiesService {
  private readonly logger = new Logger(SymbolCapabilitiesService.name);

  private cache: { at: number; gateways: GatewayOption[]; error?: string } | null = null;

  constructor(private readonly cbp: CbpAdminService) {}

  async getCapabilities(): Promise<SymbolCapabilities> {
    const { gateways, error } = await this.loadGateways();

    const symbolTypes: SymbolTypeCapability[] = Object.values(SymbolTypeEnum).map((symbolType) => {
      const categories = getEligibleGatewayCategories(symbolType);
      return {
        symbolType,
        depositTypes: (SYMBOL_TYPE_DEPOSIT_MAP[symbolType] ?? []).map((value) => ({
          value,
          gatewayBound: GATEWAY_BOUND_TYPES.has(value),
        })),
        withdrawTypes: (SYMBOL_TYPE_WITHDRAW_MAP[symbolType] ?? []).map((value) => ({
          value,
          gatewayBound: GATEWAY_BOUND_TYPES.has(value),
        })),
        defaultDepositTypes: getDefaultDepositTypes(symbolType),
        defaultWithdrawTypes: getDefaultWithdrawTypes(symbolType),
        eligibleGatewayCategories: categories,
        eligibleGateways: gateways
          .filter((g) => categories.includes(g.category))
          .map((g) => g.code),
        defaultDepositGateways: getDefaultDepositGateways(symbolType),
        defaultWithdrawGateways: getDefaultWithdrawGateways(symbolType),
      };
    });

    return {
      symbolTypes,
      gateways,
      gatewayRegistryAvailable: !error,
      gatewayRegistryError: error,
    };
  }

  /** Registered gateway codes, or null when goldex-cbp could not be reached. */
  async getRegisteredCodes(): Promise<Set<string> | null> {
    const { gateways, error } = await this.loadGateways();
    if (error) return null;
    return new Set(gateways.map((g) => g.code));
  }

  /** Metadata for one gateway code, or undefined if unknown/unreachable. */
  async getGateway(code: string): Promise<GatewayOption | undefined> {
    const { gateways } = await this.loadGateways();
    return gateways.find((g) => g.code === code);
  }

  private async loadGateways(): Promise<{ gateways: GatewayOption[]; error?: string }> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return { gateways: this.cache.gateways, error: this.cache.error };
    }

    try {
      const metadata = (await this.cbp.gateways()) as RawGatewayMetadata[];
      const gateways: GatewayOption[] = (Array.isArray(metadata) ? metadata : [])
        .filter((g): g is RawGatewayMetadata & { code: string } => !!g?.code)
        .map((g) => ({
          code: g.code,
          name: g.name ?? g.code,
          category: g.category ?? "",
          kind: g.kind ?? "",
        }));

      // Health is a nice-to-have: an admin should see that the gateway they are
      // about to make the default is currently down. Never let it fail the call.
      try {
        const health = (await this.cbp.health()) as RawGatewayHealth[];
        const byCode = new Map((Array.isArray(health) ? health : []).map((h) => [h.code, h]));
        for (const gateway of gateways) {
          const h = byCode.get(gateway.code);
          if (h) {
            gateway.status = h.status;
            gateway.statusMessage = h.message;
          }
        }
      } catch (err) {
        this.logger.warn(`cbp health unavailable: ${(err as Error).message}`);
      }

      this.cache = { at: Date.now(), gateways };
      return { gateways };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.warn(`cbp gateway registry unavailable: ${error}`);
      // Cache the failure too, so a cbp outage doesn't make every symbol write
      // wait out the RPC timeout.
      this.cache = { at: Date.now(), gateways: [], error };
      return { gateways: [], error };
    }
  }
}
