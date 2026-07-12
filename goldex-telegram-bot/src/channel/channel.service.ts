import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  async sendMessage(message: string): Promise<void> {
    this.logger.log(`Channel message queued: ${message.substring(0, 50)}...`);
  }
}
