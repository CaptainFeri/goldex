import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class ExaChannelService extends BaseChannel {
  name = 'exa_search';
  backends = ['mcporter'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.cliExecutor.run('mcporter --version');
      return true;
    } catch { return false; }
  }

  async execute(backend: string, args: { query: string }): Promise<any> {
    return this.cliExecutor.run(`mcporter call exa search --query "${args.query}"`);
  }
}