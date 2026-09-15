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

  /**
   * One item's metadata.
   *
   * A field in the provider's item hash. It used to be a key of its own with a
   * day-long expiry, which made "the list of symbols this provider offers"
   * something that decayed a member at a time — so a provider whose metadata
   * refresh had been failing showed a shrinking list rather than a stale one,
   * and nothing distinguished the two.
   */
  async setMetadata(providerKey: string, itemId: number, metadata: ItemMetadata): Promise<void> {
    await this.redisService.setProviderItem(providerKey, itemId, metadata);
    this.cache(providerKey).set(itemId, metadata);
  }

  async getMetadata(providerKey: string, itemId: number): Promise<ItemMetadata | null> {
    const cached = this.memoryCache.get(providerKey)?.get(itemId);
    if (cached) return cached;

    const metadata = await this.redisService.getProviderItem<ItemMetadata>(providerKey, itemId);
    if (!metadata) return null;
    this.cache(providerKey).set(itemId, metadata);
    return metadata;
  }

  async getAllItemIds(providerKey: string): Promise<number[]> {
    const metadata = await this.getAllMetadataForProvider(providerKey);
    return metadata.map((m) => m.itemId);
  }

  /** The provider's symbol list, in one round trip rather than a keyspace scan. */
  async getAllMetadataForProvider(providerKey: string): Promise<ItemMetadata[]> {
    return this.redisService.getProviderItems<ItemMetadata>(providerKey);
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

  /**
   * Replace the provider's whole symbol list.
   *
   * The normal path: a provider reports everything it offers, and what it did
   * not report it no longer offers. Written in one operation rather than item
   * by item, so a reader never catches the list half-replaced — and a symbol
   * that was withdrawn actually disappears instead of lingering until its own
   * expiry.
   */
  async bulkSetMetadata(providerKey: string, items: ItemMetadata[]): Promise<void> {
    await this.redisService.setProviderItems(providerKey, items);

    const fresh = new Map(items.map((item) => [item.itemId, item]));
    this.memoryCache.set(providerKey, fresh);

    this.formatter.log(
      'ItemMetadata',
      `Stored metadata for ${items.length} items for provider ${providerKey}`,
    );
  }

  private cache(providerKey: string): Map<number, ItemMetadata> {
    let providerCache = this.memoryCache.get(providerKey);
    if (!providerCache) {
      providerCache = new Map();
      this.memoryCache.set(providerKey, providerCache);
    }
    return providerCache;
  }
}
