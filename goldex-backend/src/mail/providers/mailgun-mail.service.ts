// mail/providers/mailgun-mail.service.ts
import { ConfigService, ConfigType } from "@nestjs/config";
import { Injectable } from "@nestjs/common";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import appEnvConfig from "../../config/app.env.config";
import { MailService } from "../../shared/interface/mail-service.interface";

@Injectable()
export class MailgunMailService implements MailService {
  private mg: ReturnType<Mailgun["client"]>;

  constructor(private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>) {
    // const mailgun = new Mailgun(FormData);
    // const mailgunConfig = configService.get("mailProviders", {
    //   infer: true,
    // }).mailgun;
    // this.mg = mailgun.client({
    //   username: "api",
    //   key: mailgunConfig.key,
    // });
  }

  async sendMail(to: string, subject: string, body: string): Promise<void> {
    // const mailgunConfig = this.configService.get("mailProviders", {
    //   infer: true,
    // }).mailgun;
    // const domain = mailgunConfig.domain;
    // const from = `${mailgunConfig.email}`;
    // await this.mg.messages
    //   .create(domain, {
    //     from,
    //     to: [to],
    //     subject,
    //     html: body,
    //   })
    //   .then((msg) => console.log(msg)) // logs response data
    //   .catch((err) => console.log(err)); // logs any error;
  }
}
