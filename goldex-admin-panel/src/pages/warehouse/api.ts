import { api, unwrap } from "../../api/client";
import type { Packet, Warehouse, WarehouseRequest } from "../../api/types";

/** A warehouse row with what it currently holds. */
export type WarehouseSummary = Warehouse & {
  inventoryWeight: number;
  packetCount: number;
  reservedCount: number;
};

export type WarehouseStats = {
  warehouse: Warehouse;
  inventoryWeight: number;
  packets: { total: number; free: number; reserved: number; withdrawn: number };
  requests: { depositPending: number; withdrawPending: number };
  capacityUsedPercent: number;
};

/** One crossing of the warehouse door. */
export type Movement = {
  id: string;
  direction: "IN" | "OUT";
  source: "DEPOSIT_REQUEST" | "WITHDRAW_REQUEST" | "SETTLEMENT" | "MANUAL" | "WASTAGE";
  netWeight: string | number;
  partyType: "USER" | "PROVIDER" | "SYSTEM";
  partyUser?: { id: string; firstName?: string; lastName?: string; phone?: string } | null;
  providerKey?: string | null;
  warehouse?: Warehouse | null;
  warehouseId: string;
  packetIds?: string[] | null;
  requestId?: string | null;
  notes?: string | null;
  createAt: string;
};

export type MovementTotals = {
  inboundWeight: number;
  outboundWeight: number;
  inboundCount: number;
  outboundCount: number;
  netWeight: number;
};

const BASE = "/admin/warehouse";

export const warehouseApi = {
  summary: async (): Promise<{ warehouses: WarehouseSummary[]; total: number }> =>
    unwrap((await api.get(`${BASE}/summary`, { params: { limit: "100" } })).data),

  stats: async (id: string): Promise<WarehouseStats> =>
    unwrap((await api.get(`${BASE}/${id}/stats`)).data),

  packets: async (warehouseId: string, params: Record<string, string> = {}) =>
    unwrap<{ packets: Packet[]; total: number }>(
      (await api.get(`${BASE}/packets`, { params: { warehouseId, limit: "100", ...params } })).data,
    ),

  requests: async (warehouseId: string, type: "INPUT" | "OUTPUT", params: Record<string, string> = {}) =>
    unwrap<{ requests: WarehouseRequest[]; total: number }>(
      (await api.get(`${BASE}/requests`, { params: { warehouseId, type, limit: "100", ...params } })).data,
    ),

  movements: async (params: Record<string, string> = {}) =>
    unwrap<{ movements: Movement[]; total: number }>(
      (await api.get(`${BASE}/movements`, { params: { limit: "100", ...params } })).data,
    ),

  movementTotals: async (warehouseId?: string): Promise<MovementTotals> =>
    unwrap((await api.get(`${BASE}/movements/today`, { params: warehouseId ? { warehouseId } : {} })).data),

  /** Material symbols and providers, scoped to what a warehouse operator may read. */
  lookups: async (): Promise<{ symbols: { id: string; slug: string; name: string }[]; providers: { key: string; name: string }[] }> =>
    unwrap((await api.get(`${BASE}/lookups`)).data),

  recordMovement: async (payload: Record<string, unknown>) =>
    unwrap((await api.post(`${BASE}/movements`, payload)).data),
};

export const MOVEMENT_SOURCE_LABELS: Record<Movement["source"], string> = {
  DEPOSIT_REQUEST: "درخواست واریز",
  WITHDRAW_REQUEST: "درخواست برداشت",
  SETTLEMENT: "تسویه تامین‌کننده",
  MANUAL: "ثبت دستی",
  WASTAGE: "انگی",
};

export const PARTY_LABELS: Record<Movement["partyType"], string> = {
  USER: "کاربر",
  PROVIDER: "تامین‌کننده",
  SYSTEM: "سیستم",
};

/** The counterparty as a row should read it. */
export function partyName(movement: Movement): string {
  if (movement.partyType === "PROVIDER") return movement.providerKey || "تامین‌کننده نامشخص";
  if (movement.partyType === "SYSTEM") return "سیستم";

  const user = movement.partyUser;
  if (!user) return "کاربر نامشخص";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.phone || user.id;
}
