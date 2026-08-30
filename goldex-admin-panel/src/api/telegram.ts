import { api, unwrap } from "./client";
import type {
  TelegramMarketState,
  TelegramOpportunityRecord,
  TelegramPricePoint,
  TelegramPriceFilters,
} from "./types";

const TELEGRAM_BASE = "/admin/telegram-monitoring";

export const telegramApi = {
  getMarket: async (): Promise<TelegramMarketState[]> => {
    const r = await api.get(`${TELEGRAM_BASE}/market`);
    return unwrap<TelegramMarketState[]>(r.data);
  },

  getBestBuys: async (limit = 10): Promise<TelegramMarketState[]> => {
    const r = await api.get(`${TELEGRAM_BASE}/market/best-buys`, { params: { limit } });
    return unwrap<TelegramMarketState[]>(r.data);
  },

  getBestSells: async (limit = 10): Promise<TelegramMarketState[]> => {
    const r = await api.get(`${TELEGRAM_BASE}/market/best-sells`, { params: { limit } });
    return unwrap<TelegramMarketState[]>(r.data);
  },

  getOpportunities: async (params?: {
    type?: string;
    deliveryType?: string;
    from?: number;
    to?: number;
  }): Promise<TelegramOpportunityRecord[]> => {
    const r = await api.get(`${TELEGRAM_BASE}/opportunities`, { params });
    return unwrap<TelegramOpportunityRecord[]>(r.data);
  },

  getPrices: async (params?: Record<string, string | number | undefined>): Promise<TelegramPricePoint[]> => {
    const r = await api.get(`${TELEGRAM_BASE}/prices`, { params });
    return unwrap<TelegramPricePoint[]>(r.data);
  },

  getPriceFilters: async (): Promise<TelegramPriceFilters> => {
    const r = await api.get(`${TELEGRAM_BASE}/prices/filters`);
    return unwrap<TelegramPriceFilters>(r.data);
  },
};
