export interface ProviderConfig {
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  originUrl?: string;
  auth: Record<string, string>;
  pollIntervalMs?: number;
  metadataRefreshIntervalMs?: number;
}
