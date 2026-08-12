import { Injectable } from '@nestjs/common';
import { WebChannelService } from '../channels/web-channel.service';
import { YouTubeChannelService } from '../channels/youtube-channel.service';
import { TwitterChannelService } from '../channels/twitter-channel.service';
import { BilibiliChannelService } from '../channels/bilibili-channel.service';
import { GitHubChannelService } from '../channels/github-channel.service';
import { ExaChannelService } from '../channels/exa-channel.service';
import { RssChannelService } from '../channels/rss-channel.service';

@Injectable()
export class DoctorService {
  constructor(
    private readonly web: WebChannelService,
    private readonly youtube: YouTubeChannelService,
    private readonly twitter: TwitterChannelService,
    private readonly bilibili: BilibiliChannelService,
    private readonly github: GitHubChannelService,
    private readonly exa: ExaChannelService,
    private readonly rss: RssChannelService,
  ) {}

  async checkAll() {
    const channels = [
      this.web, this.youtube, this.twitter,
      this.bilibili, this.github, this.exa, this.rss,
    ];
    const results: Record<string, any> = {};

    for (const channel of channels) {
      const report = { activeBackend: null as string | null, backends: {} as Record<string, string> };
      for (const backend of channel.backends) {
        try {
          const isHealthy = await channel.checkHealth(backend);
          report.backends[backend] = isHealthy ? '✅ OK' : '❌ Broken';
          if (isHealthy && !report.activeBackend) {
            report.activeBackend = backend;
          }
        } catch {
          report.backends[backend] = '❌ Broken';
        }
      }
      results[channel.name] = report;
    }
    return results;
  }
}