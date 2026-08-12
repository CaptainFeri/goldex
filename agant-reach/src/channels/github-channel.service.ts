import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class GitHubChannelService extends BaseChannel {
  name = 'github';
  backends = ['gh-cli'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(backend: string): Promise<boolean> {
    if (backend === 'gh-cli') {
      try {
        await this.cliExecutor.run('gh auth status');
        return true;
      } catch { return false; }
    }
    return false;
  }

  async execute(backend: string, args: { repo: string; action: 'issues' | 'readme' }): Promise<any> {
    if (args.action === 'issues') {
      return this.cliExecutor.run(`gh issue list -R ${args.repo} --limit 10 --json title,url,state`);
    }
    if (args.action === 'readme') {
      return this.cliExecutor.run(`gh api repos/${args.repo}/readme --jq .content | base64 --decode`);
    }
  }
}