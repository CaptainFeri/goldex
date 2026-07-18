import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { CreditService } from "./credit.service";

@Injectable()
export class CreditCronService {
  private readonly logger = new Logger(CreditCronService.name);

  constructor(private readonly creditService: CreditService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleReminders() {
    this.logger.log("Running credit reminder notifications check...");
    try {
      await this.creditService.sendReminderNotifications();
    } catch (error) {
      this.logger.error(`Error sending reminders: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleExpiredCredits() {
    this.logger.log("Running expired credits check...");
    try {
      await this.creditService.processExpiredCredits();
    } catch (error) {
      this.logger.error(`Error processing expired credits: ${(error as Error).message}`);
    }
  }
}
