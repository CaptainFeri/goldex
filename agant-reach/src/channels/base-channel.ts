import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config.service';
import { CliExecutorService } from '../cli-executor.service';

@Injectable()
export abstract class BaseChannel {
  abstract name: string;
  abstract backends: string[];

  constructor(
    protected readonly configService: ConfigService,
    protected readonly cliExecutor: CliExecutorService,
  ) {}

  abstract checkHealth(backend: string): Promise<boolean>;
  abstract execute(backend: string, args: any): Promise<any>;

  async run(args: any): Promise<{ backend: string; result: any }> {
    for (const backend of this.backends) {
      try {
        const isHealthy = await this.checkHealth(backend);
        if (isHealthy) {
          return { backend, result: await this.execute(backend, args) };
        }
      } catch (error) {
        console.warn(`[Agent-Reach] Backend ${backend} failed, trying next...`);
      }
    }
    throw new Error(`[Agent-Reach] All backends for ${this.name} are unavailable.`);
  }
}