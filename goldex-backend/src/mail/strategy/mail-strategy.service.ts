import { Injectable, Logger } from "@nestjs/common";
import { MailgunMailService } from "../providers/mailgun-mail.service";
import { MailService } from "../../shared/interface/mail-service.interface";

@Injectable()
export class MailStrategyService implements MailService {
  private readonly strategies: Map<string, MailService> = new Map();
  private readonly logger = new Logger(MailStrategyService.name);

  constructor(private readonly mailgunMailService: MailgunMailService) {
    this.strategies.set("mailgun", mailgunMailService);
  }

  getStrategy(provider: string): MailService {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new Error(`Mail provider "${provider}" not supported`);
    }
    return strategy;
  }

  async sendMail(to: string, subject: string, body: string): Promise<void> {
    const mailgun = this.strategies.get("mailgun");
    if (!mailgun) {
      this.logger.warn("No mail provider registered — skipping email");
      return;
    }
    await mailgun.sendMail(to, subject, body);
  }
}
