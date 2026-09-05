import { api, unwrap } from "./client";
import type {
  AdminBankAccount,
  Paginated,
  PaginationParams,
  P2pDashboard,
  P2pEscalation,
  P2pMatch,
  P2pResolutionType,
  P2pSettings,
} from "./types";

/**
 * Legacy paginated shape, for the endpoints not yet migrated to the standard
 * contract. Replace each use with `Paginated<T>` as its endpoint moves over;
 * this alias goes away with the last one.
 */
type Page<T> = { items: T[]; total: number; page: number; limit: number };

// ─── Company bank accounts ───────────────────────────────────
// Shared resource: the same account can be flagged for deposit, for
// withdraw, for both, or for neither (parked).

export type BankAccountDirection = "deposit" | "withdraw";

export const bankAccountsApi = {
  list: async (
    params: {
      direction?: BankAccountDirection;
      symbolId?: string;
      status?: string;
    } & PaginationParams = {}
  ) => unwrap<Paginated<AdminBankAccount>>((await api.get("/admin/bank-accounts", { params })).data),

  get: async (id: string) =>
    unwrap<AdminBankAccount>((await api.get(`/admin/bank-accounts/${id}`)).data),

  create: async (body: Partial<AdminBankAccount>) =>
    unwrap<AdminBankAccount>((await api.post("/admin/bank-accounts", body)).data),

  update: async (id: string, body: Partial<AdminBankAccount>) =>
    unwrap<AdminBankAccount>((await api.patch(`/admin/bank-accounts/${id}`, body)).data),

  /** Turn either direction on or off. Both may be true, both may be false. */
  setDirections: async (id: string, body: { useForDeposit: boolean; useForWithdraw: boolean }) =>
    unwrap<AdminBankAccount>((await api.patch(`/admin/bank-accounts/${id}/directions`, body)).data),

  /** Accounts are never deleted — they are deactivated, because settled
   *  matches reference them. */
  setStatus: async (id: string, status: AdminBankAccount["status"]) =>
    unwrap<AdminBankAccount>((await api.patch(`/admin/bank-accounts/${id}/status`, { status })).data),

};

// ─── P2P matching / settlement ───────────────────────────────

export const p2pApi = {
  dashboard: async () =>
    unwrap<P2pDashboard>((await api.get("/admin/p2p/dashboard")).data),

  listEscalations: async (params: {
    status?: string;
    reason?: string;
    assignedAdminId?: string;
    minAmount?: number;
    page?: number;
    limit?: number;
  } = {}) => unwrap<Page<P2pEscalation>>((await api.get("/admin/p2p/escalations", { params })).data),

  getEscalation: async (id: string) =>
    unwrap<P2pEscalation>((await api.get(`/admin/p2p/escalations/${id}`)).data),

  resolveEscalation: async (
    id: string,
    body: { resolution: P2pResolutionType; adminAccountId?: string; note: string },
  ) =>
    unwrap<P2pEscalation>(
      (
        await api.post(`/admin/p2p/escalations/${id}/resolve`, body, {
          // Settlement is money-moving: never let a double-click settle twice.
          headers: { "Idempotency-Key": `esc-${id}-${body.resolution}-${Date.now()}` },
        })
      ).data,
    ),

  listMatches: async (params: { status?: string; page?: number; limit?: number } = {}) =>
    unwrap<Page<P2pMatch>>((await api.get("/admin/p2p/matches", { params })).data),

  getSettings: async () => unwrap<P2pSettings>((await api.get("/admin/p2p/settings")).data),

  updateSettings: async (body: Partial<P2pSettings>) =>
    unwrap<P2pSettings>((await api.patch("/admin/p2p/settings", body)).data),
};
