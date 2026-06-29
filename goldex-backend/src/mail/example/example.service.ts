import { Injectable } from '@nestjs/common';
import { MailStrategyService } from '../strategy/mail-strategy.service';

@Injectable()
export class ExampleService {
  constructor(private readonly mailStrategyService: MailStrategyService) {}

  async sendWelcomeEmail(to: string): Promise<void> {
    const mailService = this.mailStrategyService.getStrategy('mailgun');

    await mailService.sendMail(
      to,
      'Welcome to our service!',
      'Thanks for signing up. Let us know if you have any questions!',
    );
  }
}
