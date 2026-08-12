import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class YouTubeChannelService extends BaseChannel {
  name = 'youtube';
  backends = ['yt-dlp'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(backend: string): Promise<boolean> {
    if (backend === 'yt-dlp') {
      try {
        const output = await this.cliExecutor.run('yt-dlp --version');
        return output.trim().length > 0;
      } catch { return false; }
    }
    return false;
  }

  async execute(backend: string, args: { query?: string; url?: string }): Promise<any> {
    if (args.url) {
      return this.cliExecutor.run(
        `yt-dlp --write-auto-sub --skip-download --print "%(title)s\n%(description)s" "${args.url}"`
      );
    }
    if (args.query) {
      return this.cliExecutor.run(
        `yt-dlp "ytsearch5:${args.query}" --print "%(title)s | %(webpage_url)s"`
      );
    }
    return '';
  }
}