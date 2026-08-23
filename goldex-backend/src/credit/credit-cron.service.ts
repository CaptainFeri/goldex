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

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleSettlementTimers() {
    this.logger.log("Running settlement timer state machine...");
    try {
      await this.creditService.processSettlementTimers();
    } catch (error) {
      this.logger.error(`Error processing settlement timers: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleRiskStateTransitions() {
    this.logger.log("Running risk state machine...");
    try {
      await this.creditService.processRiskStateTransitions();
    } catch (error) {
      this.logger.error(`Error processing risk state transitions: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePendDeadlines() {
    this.logger.log("Running pend-deadline checks for credit-linked requests...");
    try {
      await this.creditService.processPendDeadlines();
    } catch (error) {
      this.logger.error(`Error processing pend deadlines: ${(error as Error).message}`);
    }
  }
}
