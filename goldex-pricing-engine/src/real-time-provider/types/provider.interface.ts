import { ProviderConfig } from './provider-config.type';
import { PriceData } from './price-data.type';
import { DealView } from './deal-view.type';

export interface IRealtimePriceProvider {
  readonly config: ProviderConfig;

  init(config: ProviderConfig): Promise<void>;
  connect(): Promise<void>;
  disconnect(): void;
  stop(): void;
  isConnected(): boolean;
  /**
   * Whether the provider has refused the stored session.
   *
   * The difference between waiting on a network and waiting on a login, which
   * decides whether reconnecting is worth doing at all.
   */
  hasExpiredSession(): boolean;
  getShopProfile(): Promise<any>;
  getPrice(itemId: number): Promise<PriceData | null>;
  getDealView(itemId: number, dealType?: number): Promise<DealView>;
  onPriceUpdate(callback: (data: PriceData) => void): void;
}
