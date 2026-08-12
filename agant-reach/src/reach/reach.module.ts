import { Module } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ReachController } from './reach.controller';
import { DoctorService } from './doctor.service';
import { WebChannelService } from '../channels/web-channel.service';
import { YouTubeChannelService } from '../channels/youtube-channel.service';
import { TwitterChannelService } from '../channels/twitter-channel.service';
import { BilibiliChannelService } from '../channels/bilibili-channel.service';
import { GitHubChannelService } from '../channels/github-channel.service';
import { ExaChannelService } from '../channels/exa-channel.service';
import { RssChannelService } from '../channels/rss-channel.service';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Module({
  controllers: [ReachController],
  providers: [
    DoctorService,
    WebChannelService,
    YouTubeChannelService,
    TwitterChannelService,
    BilibiliChannelService,
    GitHubChannelService,
    ExaChannelService,
    RssChannelService,
    ConfigService,
    CliExecutorService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class ReachModule {}