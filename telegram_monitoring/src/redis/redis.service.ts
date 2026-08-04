import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Cache key families cleared on a fresh start. */
const CACHE_PATTERNS = ['wallet:*', 'price:*', 'arbitrage:*', 'opportunity:*'];
/** Disable with REDIS_RESET_ON_START=false. */
const RESET_ON_START = process.env.REDIS_RESET_ON_START !== 'false';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('redis.host', 'localhost');
    const port = configService.get<number>('redis.port', 6379);
    const password = configService.get<string>('redis.password');

    this.client = new Redis({
      host,
      port,
      password,
      retryStrategy: (t) => Math.min(t * 100, 5000),
    });
    this.client.on('connect', () =>
      this.logger.log(`Connected to Redis at ${host}:${port}`),
    );
    this.client.on('error', (err) => this.logger.error('Redis error', err));
  }

  /** Fresh start: drop all cached price/arbitrage/opportunity/wallet keys. */
  async onModuleInit(): Promise<void> {
    if (!RESET_ON_START) return;
    try {
      let total = 0;
      for (const pattern of CACHE_PATTERNS) {
        const keys = await this.client.keys(pattern);
        if (keys.length === 0) continue;
        await this.client.del(...keys);
        total += keys.length;
      }
      if (total > 0) {
        this.logger.warn(
          `Cleared ${total} cached Redis keys (fresh start). ` +
            `Set REDIS_RESET_ON_START=false to keep cache across restarts.`,
        );
      } else {
        this.logger.log('Redis cache already empty');
      }
    } catch (error) {
      this.logger.error('Failed to clear Redis cache on start', error);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
