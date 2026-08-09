import { Injectable, NotFoundException } from "@nestjs/common";
import {
  IPaymentGateway,
  GatewayMetadata,
  GatewayHealthResult,
} from "./payment-gateway.interface";
import { KainoGatewayService } from "./informal/kaino-gateway.service";
import { ShahinGatewayService } from "./shahin/shahin-gateway.service";
import { PaymentCategoryEnum } from "../enum/payment-category.enum";
import { PaymentGatewayKindEnum } from "../enum/payment-gateway-kind.enum";

/**
 * Central registry of every registered payment gateway.
 * Add new providers by implementing IPaymentGateway and registering
 * them in the constructor.
 */
@Injectable()
export class GatewayRegistry {
  private readonly gateways = new Map<string, IPaymentGateway>();

  constructor(
    private readonly kainoGateway: KainoGatewayService,
    private readonly shahinGateway: ShahinGatewayService,
  ) {
    this.register(this.kainoGateway);
    this.register(this.shahinGateway);
  }

  private register(gateway: IPaymentGateway): void {
    this.gateways.set(gateway.metadata.code, gateway);
  }

  getByCode(code: string): IPaymentGateway {
    const gateway = this.gateways.get(code);
    if (!gateway) {
      throw new NotFoundException(`Payment gateway "${code}" is not registered`);
    }
    return gateway;
  }

  find(
    category?: PaymentCategoryEnum,
    kind?: PaymentGatewayKindEnum,
  ): IPaymentGateway[] {
    return [...this.gateways.values()].filter(
      (g) =>
        (!category || g.metadata.category === category) &&
        (!kind || g.metadata.kind === kind),
    );
  }

  metadata(): GatewayMetadata[] {
    return [...this.gateways.values()].map((g) => g.metadata);
  }

  availableCodes(): string[] {
    return [...this.gateways.keys()];
  }

  isRegistered(code: string): boolean {
    return this.gateways.has(code);
  }

  /**
   * Runs the health probe of every registered gateway. Gateways without a
   * healthCheck implementation report `unknown`.
   */
  async health(): Promise<GatewayHealthResult[]> {
    const results: GatewayHealthResult[] = [];
    for (const gateway of this.gateways.values()) {
      if (!gateway.healthCheck) {
        results.push({
          code: gateway.metadata.code,
          name: gateway.metadata.name,
          category: gateway.metadata.category,
          kind: gateway.metadata.kind,
          status: "unknown",
          message: "No health probe implemented",
          checkedAt: new Date().toISOString(),
        });
        continue;
      }
      try {
        results.push(await gateway.healthCheck());
      } catch (err: any) {
        results.push({
          code: gateway.metadata.code,
          name: gateway.metadata.name,
          category: gateway.metadata.category,
          kind: gateway.metadata.kind,
          status: "down",
          message: (err as Error)?.message ?? String(err),
          checkedAt: new Date().toISOString(),
        });
      }
    }
    return results;
  }
}
