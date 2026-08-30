import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class BilibiliChannelService extends BaseChannel {
  name = 'bilibili';
  backends = ['bili-cli', 'OpenCLI'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(backend: string): Promise<boolean> {
    try {
      if (backend === 'bili-cli') {
        await this.cliExecutor.run('bili-cli --help');
        return true;
      }
      if (backend === 'OpenCLI') {
        await this.cliExecutor.run('opencli --version');
        return true;
      }
    } catch { return false; }
    return false;
  }

  async execute(backend: string, args: { url?: string; query?: string }): Promise<any> {
    if (backend === 'bili-cli') {
      return this.cliExecutor.run(`bili-cli ${args.url || args.query}`);
    }
    if (backend === 'OpenCLI') {
      return this.cliExecutor.run(`opencli bilibili read ${args.url || args.query}`);
    }
  }
}