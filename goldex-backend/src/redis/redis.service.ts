import { ConfigService, ConfigType } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import Redis, { ChainableCommander } from 'ioredis';
import appEnvConfig from '../config/app.env.config';

dotenv.config();

const SNAPSHOT_PREFIX = 'price:snapshot:';
const SNAPSHOT_CHANNEL_PREFIX = 'price:snapshot:';

export interface SnapshotItem {
  itemId: number;
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
}

export interface SnapshotData {
  providerKey: string;
  items: SnapshotItem[];
  timestamp: string;
}

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: ConfigService<ConfigType<typeof appEnvConfig>>) {
    this.client = new Redis(config.get('redis', { infer: true }).port, config.get('redis', { infer: true }).host);
  }

  getClient(): Redis {
    return this.client;
  }

  async setWithExpiration(key: string, value: any, expiresIn = 120): Promise<string> {
    return await this.client.set(key, JSON.stringify(value), 'EX', expiresIn);
  }

  async get(key: string): Promise<any> {
    const result = await this.client.get(key);
    return result ? JSON.parse(result) : null;
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  // ─── Hash operations ──────────────────────────────────────────────────────

  async hset(key: string, field: string, value: any): Promise<void> {
    await this.client.hset(key, field, JSON.stringify(value));
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const raw = await this.client.hgetall(key);
    const result: Record<string, T> = {};
    for (const [field, val] of Object.entries(raw)) {
      result[field] = JSON.parse(val as string) as T;
    }
    return result;
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    if (fields.length > 0) {
      await this.client.hdel(key, ...fields);
    }
  }

  // ─── Pipeline ─────────────────────────────────────────────────────────────

  pipeline(): ChainableCommander {
    return this.client.pipeline();
  }

  // ─── Pub/Sub ──────────────────────────────────────────────────────────────

  async publish(channel: string, message: any): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message));
  }

  // ─── Snapshot methods ─────────────────────────────────────────────────────

  private snapshotHashKey(providerKey: string): string {
    return `${SNAPSHOT_PREFIX}${providerKey}`;
  }

  private snapshotChannel(providerKey: string): string {
    return `${SNAPSHOT_CHANNEL_PREFIX}${providerKey}`;
  }

  async setSnapshot(providerKey: string, items: SnapshotItem[]): Promise<void> {
    const hashKey = this.snapshotHashKey(providerKey);
    const pipeline = this.client.pipeline();
    pipeline.del(hashKey);
    for (const item of items) {
      pipeline.hset(hashKey, String(item.itemId), JSON.stringify(item));
    }
    await pipeline.exec();
  }

  async getSnapshot(providerKey: string): Promise<SnapshotItem[]> {
    const hashKey = this.snapshotHashKey(providerKey);
    const raw = await this.client.hgetall(hashKey);
    return Object.values(raw).map((v) => JSON.parse(v as string) as SnapshotItem);
  }

  async getAllSnapshotsFromRedis(): Promise<Record<string, SnapshotItem[]>> {
    const keys = await this.client.keys(`${SNAPSHOT_PREFIX}*`);
    const result: Record<string, SnapshotItem[]> = {};
    for (const key of keys) {
      const providerKey = key.replace(SNAPSHOT_PREFIX, '');
      result[providerKey] = await this.getSnapshot(providerKey);
    }
    return result;
  }

  async publishSnapshot(providerKey: string, items: SnapshotItem[]): Promise<void> {
    const channel = this.snapshotChannel(providerKey);
    const message: SnapshotData = {
      providerKey,
      items,
      timestamp: new Date().toISOString(),
    };
    await this.publish(channel, message);
  }

  async deleteSnapshot(providerKey: string): Promise<void> {
    const hashKey = this.snapshotHashKey(providerKey);
    await this.client.del(hashKey);
  }
}
