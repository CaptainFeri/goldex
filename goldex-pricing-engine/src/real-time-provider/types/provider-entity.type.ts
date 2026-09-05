export interface ProviderEntityInput {
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  phone?: string;
  sendOtpUrl?: string;
  verifyCodeUrl?: string;
  auth?: Record<string, any>;
  config?: Record<string, any>;
  active?: boolean;
  metadataRefreshIntervalMs?: number;
}

export interface ProviderEntityOutput {
  id: string;
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  phone?: string;
  sendOtpUrl?: string;
  verifyCodeUrl?: string;
  auth: Record<string, any>;
  config: Record<string, any>;
  active: boolean;
  metadataRefreshIntervalMs: number;
  createdAt: Date;
  updatedAt: Date;
}
