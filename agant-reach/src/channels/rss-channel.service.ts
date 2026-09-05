import { Injectable } from '@nestjs/common';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';
import Parser from 'rss-parser';

@Injectable()
export class RssChannelService extends BaseChannel {
  name = 'rss';
  backends = ['rss-parser'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(): Promise<boolean> { return true; }

  async execute(backend: string, args: { url: string }): Promise<any> {
    const parser = new Parser();
    return await parser.parseURL(args.url);
  }
}