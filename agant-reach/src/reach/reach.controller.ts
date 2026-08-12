import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { WebChannelService } from '../channels/web-channel.service';
import { YouTubeChannelService } from '../channels/youtube-channel.service';
import { TwitterChannelService } from '../channels/twitter-channel.service';
import { BilibiliChannelService } from '../channels/bilibili-channel.service';
import { GitHubChannelService } from '../channels/github-channel.service';
import { ExaChannelService } from '../channels/exa-channel.service';
import { RssChannelService } from '../channels/rss-channel.service';
import { DoctorService } from './doctor.service';

@Controller('reach')
@UseGuards(ApiKeyGuard)
export class ReachController {
  constructor(
    private readonly webChannel: WebChannelService,
    private readonly ytChannel: YouTubeChannelService,
    private readonly twChannel: TwitterChannelService,
    private readonly biliChannel: BilibiliChannelService,
    private readonly ghChannel: GitHubChannelService,
    private readonly exaChannel: ExaChannelService,
    private readonly rssChannel: RssChannelService,
    private readonly doctorService: DoctorService,
  ) {}

  @Get('doctor')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async doctor() {
    return this.doctorService.checkAll();
  }

  @Get('web')
  async getWeb(@Query('url') url: string) {
    return this.webChannel.run({ url });
  }

  @Get('youtube')
  async getYoutube(@Query('query') query: string, @Query('url') url: string) {
    return this.ytChannel.run(url ? { url } : { query });
  }

  @Get('twitter')
  async getTwitter(@Query('url') url: string, @Query('search') search: string) {
    return this.twChannel.run(url ? { url } : { search });
  }

  @Get('bilibili')
  async getBilibili(@Query('url') url: string, @Query('query') query: string) {
    return this.biliChannel.run(url ? { url } : { query });
  }

  @Get('github')
  async getGithub(@Query('repo') repo: string, @Query('action') action: 'issues' | 'readme') {
    return this.ghChannel.run({ repo, action });
  }

  @Get('search')
  async searchWeb(@Query('query') query: string) {
    return this.exaChannel.run({ query });
  }

  @Get('rss')
  async getRss(@Query('url') url: string) {
    return this.rssChannel.run({ url });
  }
}