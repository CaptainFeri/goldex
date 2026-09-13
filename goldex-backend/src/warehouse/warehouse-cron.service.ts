import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WarehouseRequestService } from "./service/warehouse-request.service";
import { MATERIAL_SETTLEMENT_SYMBOL, WarehouseService } from "./service/warehouse.service";
import { WarehouseEvents } from "../shared/constants/events.constants";

@Injectable()
export class WarehouseCronService {
  private readonly logger = new Logger(WarehouseCronService.name);

  constructor(
    private readonly requestService: WarehouseRequestService,
    private readonly warehouseService: WarehouseService,
    private readonly events: EventEmitter2
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoCancelExpiredRequests(): Promise<void> {
    try {
      const cancelled = await this.requestService.autoCancelExpiredRequests();
      if (cancelled > 0) {
        this.logger.log(`Auto-cancelled ${cancelled} approved warehouse request(s) that passed their delivery day`);
      }
    } catch (error) {
      this.logger.error(`Auto-cancel job failed: ${(error as any).message}`);
    }
  }

  /**
   * Re-raises gold that is settled for but still unpacked.
   *
   * The notification when a settlement lands is a single moment that an
   * operator can miss — off shift, or simply scrolled past. Unpacked material
   * is gold the platform owns that no withdrawal can be served from, so it is
   * worth saying again until somebody packs it.
   *
   * Daily rather than hourly: this is a nudge about work in the physical
   * world, and a warehouse operator who has not got to it in an hour does not
   * need telling twice.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindUnpackedMaterial(): Promise<void> {
    try {
      const balance = await this.warehouseService.getSettlementMaterialBalance();
      const waiting = balance.providers.filter((provider) => provider.unpacked > 0);

      for (const provider of waiting) {
        this.events.emit(WarehouseEvents.UNPACKED_MATERIAL, {
          providerKey: provider.providerKey,
          symbol: MATERIAL_SETTLEMENT_SYMBOL,
          amount: provider.unpacked,
          unpackedBalance: provider.unpacked,
        });
      }

      if (waiting.length > 0) {
        this.logger.log(
          `${waiting.length} provider(s) still have unpacked settlement material ` +
            `(${balance.totalUnpacked}g in total)`
        );
      }
    } catch (error) {
      this.logger.error(`Unpacked-material reminder failed: ${(error as any).message}`);
    }
  }
}
