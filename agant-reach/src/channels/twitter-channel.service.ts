import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class TwitterChannelService extends BaseChannel {
  name = 'twitter';
  backends = ['twitter-cli', 'OpenCLI'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(backend: string): Promise<boolean> {
    try {
      if (backend === 'twitter-cli') {
        await this.cliExecutor.run('twitter-cli --version');
        return true;
      }
      if (backend === 'OpenCLI') {
        await this.cliExecutor.run('opencli --version');
        return true;
      }
    } catch { return false; }
    return false;
  }

  async execute(backend: string, args: { url?: string; search?: string }): Promise<any> {
    if (backend === 'twitter-cli') {
      if (args.url) return this.cliExecutor.run(`twitter-cli get ${args.url}`);
      if (args.search) return this.cliExecutor.run(`twitter-cli search "${args.search}"`);
    }
    if (backend === 'OpenCLI') {
      return this.cliExecutor.run(`opencli twitter read ${args.url || args.search}`);
    }
  }
}