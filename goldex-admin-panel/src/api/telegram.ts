import axios from "axios";
import { getToken } from "./client";
import type {
  TelegramMarketState,
  TelegramOpportunityRecord,
  TelegramPricePoint,
  TelegramPriceFilters,
} from "./types";

const tgApi = axios.create({
  baseURL: "/tg-api/api",
});

tgApi.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const telegramApi = {
  getMarket: async (): Promise<TelegramMarketState[]> => {
    const r = await tgApi.get("/market");
    return r.data as TelegramMarketState[];
  },

  getOpportunities: async (params?: {
    type?: string;
    deliveryType?: string;
    from?: number;
    to?: number;
  }): Promise<TelegramOpportunityRecord[]> => {
    const r = await tgApi.get("/opportunities", { params });
    return r.data as TelegramOpportunityRecord[];
  },

  getPrices: async (params?: Record<string, string | number | undefined>): Promise<TelegramPricePoint[]> => {
    const r = await tgApi.get("/prices", { params });
    return r.data as TelegramPricePoint[];
  },

  getPriceFilters: async (): Promise<TelegramPriceFilters> => {
    const r = await tgApi.get("/prices/filters");
    return r.data as TelegramPriceFilters;
  },
};
