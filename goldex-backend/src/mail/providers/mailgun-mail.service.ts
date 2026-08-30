import { ConfigService, ConfigType } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import appEnvConfig from "../../config/app.env.config";
import { MailService } from "../../shared/interface/mail-service.interface";

@Injectable()
export class MailgunMailService implements MailService {
  private mg: ReturnType<Mailgun["client"]>;
  private readonly logger = new Logger(MailgunMailService.name);
  private readonly fromEmail: string;
  private readonly domain: string;

  constructor(private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>) {
    const mailgunConfig = configService.get("mailProviders", { infer: true }).mailgun;
    if (mailgunConfig?.key && mailgunConfig?.domain) {
      const mailgun = new Mailgun(FormData);
      this.mg = mailgun.client({
        username: "api",
        key: mailgunConfig.key,
        url: mailgunConfig.defaultUrl || "https://api.mailgun.net",
      });
      this.domain = mailgunConfig.domain;
      this.fromEmail = mailgunConfig.email;
      this.logger.log("Mailgun client initialized");
    } else {
      this.logger.warn("Mailgun not configured — missing API key or domain");
    }
  }

  async sendMail(to: string, subject: string, body: string): Promise<void> {
    if (!this.mg || !this.domain || !this.fromEmail) {
      this.logger.warn("Mailgun not configured — skipping email");
      return;
    }
    try {
      const result = await this.mg.messages.create(this.domain, {
        from: this.fromEmail,
        to: [to],
        subject,
        html: body,
      });
      this.logger.log(`Email sent to ${to}: ${result.id || "OK"}`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
      throw err;
    }
  }
}
