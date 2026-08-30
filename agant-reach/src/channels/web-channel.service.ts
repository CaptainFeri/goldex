import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseChannel } from './base-channel';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export class WebChannelService extends BaseChannel {
  name = 'web';
  backends = ['jina'];

  constructor(config: ConfigService, cli: CliExecutorService) {
    super(config, cli);
  }

  async checkHealth(backend: string): Promise<boolean> {
    if (backend === 'jina') {
      try {
        const res = await axios.get('https://r.jina.ai/https://example.com', { timeout: 5000 });
        return res.status === 200;
      } catch { return false; }
    }
    return false;
  }

  async execute(backend: string, args: { url: string }): Promise<string> {
    const res = await axios.get(`https://r.jina.ai/${args.url}`, { timeout: 30000 });
    return res.data;
  }
}