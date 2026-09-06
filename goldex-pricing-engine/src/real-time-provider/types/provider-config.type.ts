import { CurrencyUnit } from '../../common/currency-unit';

export interface ProviderConfig {
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  originUrl?: string;
  auth: Record<string, string>;
  /** Unit the provider quotes in; the engine converts everything to Rial. */
  priceUnit?: CurrencyUnit;
  pollIntervalMs?: number;
  metadataRefreshIntervalMs?: number;
}
