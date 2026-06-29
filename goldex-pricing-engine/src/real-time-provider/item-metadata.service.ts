import { Injectable } from '@nestjs/common';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { PriceData, RedisService } from '../redis/redis.service';
import { ItemMetadata } from './types/item-metadata.type';

export { ItemMetadata };

@Injectable()
export class ItemMetadataService {
  private memoryCache = new Map<string, Map<number, ItemMetadata>>();

  constructor(
    private readonly redisService: RedisService,
    private readonly formatter: ConsoleFormatterService,
  ) {}

  async setMetadata(providerKey: string, itemId: number, metadata: ItemMetadata): Promise<void> {
    const key = `item:metadata:${providerKey}:${itemId}`;
    await this.redisService.setMetadata(key, metadata);
    if (!this.memoryCache.has(providerKey)) {
      this.memoryCache.set(providerKey, new Map());
    }
    this.memoryCache.get(providerKey)!.set(itemId, metadata);
  }

  async getMetadata(providerKey: string, itemId: number): Promise<ItemMetadata | null> {
    const providerCache = this.memoryCache.get(providerKey);
    if (providerCache?.has(itemId)) {
      return providerCache.get(itemId)!;
    }
    const key = `item:metadata:${providerKey}:${itemId}`;
    const data = await this.redisService.getMetadata(key);
    if (data) {
      const metadata = data as ItemMetadata;
      if (!this.memoryCache.has(providerKey)) {
        this.memoryCache.set(providerKey, new Map());
      }
      this.memoryCache.get(providerKey)!.set(itemId, metadata);
      return metadata;
    }
    return null;
  }

  async getAllItemIds(providerKey: string): Promise<number[]> {
    const metadata = await this.getAllMetadataForProvider(providerKey);
    return metadata.map((m) => m.itemId);
  }

  async getAllMetadataForProvider(providerKey: string): Promise<ItemMetadata[]> {
    const pattern = `item:metadata:${providerKey}:*`;
    const keys = await this.redisService.getKeys(pattern);
    const items: ItemMetadata[] = [];
    for (const key of keys) {
      const data = await this.redisService.getMetadata(key);
      if (data) {
        items.push(data as ItemMetadata);
      }
    }
    return items;
  }

  async enrichPriceData(priceData: PriceData): Promise<PriceData> {
    const metadata = await this.getMetadata(priceData.providerKey!, priceData.itemId);
    if (metadata) {
      priceData.itemName = metadata.name;
      priceData.unit = metadata.unit;
      priceData.groupId = metadata.groupId;
      priceData.groupName = metadata.groupName;
    }
    return priceData;
  }

  async bulkSetMetadata(providerKey: string, items: ItemMetadata[]): Promise<void> {
    for (const item of items) {
      await this.setMetadata(providerKey, item.itemId, item);
    }
    this.formatter.log('ItemMetadata', `Stored metadata for ${items.length} items for provider ${providerKey}`);
  }
}
