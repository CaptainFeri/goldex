import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { WarehouseRequestService } from "./service/warehouse-request.service";

@Injectable()
export class WarehouseCronService {
  private readonly logger = new Logger(WarehouseCronService.name);

  constructor(private readonly requestService: WarehouseRequestService) {}

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
}
