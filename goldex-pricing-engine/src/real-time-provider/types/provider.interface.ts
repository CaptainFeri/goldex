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
  getShopProfile(): Promise<any>;
  getPrice(itemId: number): Promise<PriceData | null>;
  getDealView(itemId: number, dealType?: number): Promise<DealView>;
  onPriceUpdate(callback: (data: PriceData) => void): void;
}
