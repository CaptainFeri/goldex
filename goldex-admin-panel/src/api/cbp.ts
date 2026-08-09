import { api, unwrap } from "./client";

export interface CbpGatewayHealth {
  code: string;
  name: string;
  category: string;
  kind: string;
  status: "up" | "down" | "not_configured" | "unknown";
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface CbpPayment {
  id: string;
  userId: string;
  externalReference?: string;
  symbolId?: string;
  symbol?: { id: string; slug?: string; name?: string } | null;
  operation: string;
  category: string;
  gatewayKind?: string;
  gatewayCode?: string;
  type: string;
  amount: number | string;
  currency?: string;
  status: string;
  identifier: string;
  stan?: string;
  ipgReference?: string;
  gatewayUrl?: string;
  callbackUrl?: string;
  notes?: string;
  adminId?: string;
  metadata?: Record<string, any> | null;
  rawRequest?: Record<string, any> | null;
  rawResponse?: Record<string, any> | null;
  completedAt?: string;
  createAt?: string;
  updateAt?: string;
}

export interface CbpPaymentListResult {
  data: CbpPayment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CbpPaymentFilters {
  page?: number;
  limit?: number;
  status?: string;
  operation?: string;
  gatewayCode?: string;
  userId?: string;
  externalReference?: string;
  identifier?: string;
}

const CBP_BASE = "/admin/cbp";

export const cbpApi = {
  getHealth: async (): Promise<CbpGatewayHealth[]> => {
    const r = await api.get(`${CBP_BASE}/health`);
    return unwrap<CbpGatewayHealth[]>(r.data);
  },

  getGateways: async (): Promise<{ code: string; name: string; category: string; kind: string }[]> => {
    const r = await api.get(`${CBP_BASE}/gateways`);
    return unwrap(r.data);
  },

  getPayments: async (filters: CbpPaymentFilters): Promise<CbpPaymentListResult> => {
    const r = await api.get(`${CBP_BASE}/payments`, { params: filters });
    return unwrap<CbpPaymentListResult>(r.data);
  },

  getPayment: async (id: string): Promise<CbpPayment> => {
    const r = await api.get(`${CBP_BASE}/payments/${id}`);
    return unwrap<CbpPayment>(r.data);
  },
};
