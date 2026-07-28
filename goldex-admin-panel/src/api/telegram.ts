import { api, unwrap } from "./client";
import type {
  TelegramMarketState,
  TelegramOpportunityRecord,
  TelegramPricePoint,
  TelegramPriceFilters,
} from "./types";

const TG = "/tg-api/api";

export const telegramApi = {
  getMarket: async (): Promise<TelegramMarketState[]> => {
    const r = await api.get(`${TG}/market`);
    return unwrap<TelegramMarketState[]>(r.data);
  },

  getOpportunities: async (params?: {
    type?: string;
    deliveryType?: string;
    from?: number;
    to?: number;
  }): Promise<TelegramOpportunityRecord[]> => {
    const r = await api.get(`${TG}/opportunities`, { params });
    return unwrap<TelegramOpportunityRecord[]>(r.data);
  },

  getPrices: async (params?: Record<string, string | number | undefined>): Promise<TelegramPricePoint[]> => {
    const r = await api.get(`${TG}/prices`, { params });
    return unwrap<TelegramPricePoint[]>(r.data);
  },

  getPriceFilters: async (): Promise<TelegramPriceFilters> => {
    const r = await api.get(`${TG}/prices/filters`);
    return unwrap<TelegramPriceFilters>(r.data);
  },
};
