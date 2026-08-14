import { api, unwrap } from "./client";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "RESOLVED" | "CLOSED";
export type TicketCategory = "TRADING" | "KYC" | "WITHDRAWAL" | "DEPOSIT" | "ACCOUNT" | "TECHNICAL" | "OTHER";
export type TicketSource = "USER_PANEL" | "TELEGRAM" | "ADMIN" | "EMAIL" | "PHONE";
export type NoteCategory = "GENERAL" | "SUPPORT" | "COMPLIANCE" | "SALES" | "COMPLAINT";
export type CommunicationChannel = "EMAIL" | "SMS" | "TELEGRAM" | "IN_APP" | "PHONE";

export interface CustomerTag {
  id: string;
  name: string;
  color: string;
  createAt?: string;
}

export interface CustomerSegment {
  id: string;
  name: string;
  description?: string | null;
  criteria: Record<string, any>;
  isDynamic: boolean;
  createdById?: string;
  createAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  user?: { phone?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null };
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: TicketCategory;
  source: TicketSource;
  assignedTo?: { id: string; firstName?: string; lastName?: string; phone?: string } | null;
  assignedToId?: string | null;
  satisfactionScore?: number | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  firstResponseAt?: string | null;
  messages?: TicketMessage[];
  createAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: "USER" | "ADMIN";
  message: string;
  attachments?: { fileName: string; fileUrl: string; mimeType: string }[];
  isInternal?: boolean;
  createAt: string;
}

export interface CustomerNote {
  id: string;
  userId: string;
  adminId?: string;
  content: string;
  category: NoteCategory;
  isPinned?: boolean;
  createAt: string;
}

export interface CommunicationLog {
  id: string;
  userId: string;
  channel: CommunicationChannel;
  direction: "OUTBOUND" | "INBOUND";
  subject?: string | null;
  body?: string | null;
  templateSlug?: string | null;
  status: "SENT" | "DELIVERED" | "FAILED" | "BOUNCED";
  externalId?: string | null;
  admin?: { id: string; phone?: string | null } | null;
  sentAt: string;
}

export interface Customer360 {
  user?: any;
  kyc?: any;
  wallets?: any[];
  tags?: CustomerTag[];
  segments?: CustomerSegment[];
  notes?: CustomerNote[];
  tickets?: SupportTicket[];
  communications?: CommunicationLog[];
  stats?: any;
  [k: string]: any;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  avgSatisfaction: number;
  byCategory: { category: TicketCategory; count: number }[];
}

export interface TicketListResult {
  data: SupportTicket[];
  total: number;
}

const CRM_BASE = "/admin/crm";

export const crmApi = {
  getCustomer360: async (userId: string): Promise<Customer360> => {
    const r = await api.get(`${CRM_BASE}/users/${userId}/360`);
    return unwrap<Customer360>(r.data);
  },

  // ---- Notes ----
  getNotes: async (userId: string): Promise<CustomerNote[]> => {
    const r = await api.get(`${CRM_BASE}/users/${userId}/notes`);
    return unwrap<CustomerNote[]>(r.data);
  },
  addNote: async (userId: string, payload: { content: string; category?: NoteCategory }): Promise<CustomerNote> => {
    const r = await api.post(`${CRM_BASE}/users/${userId}/notes`, payload);
    return unwrap<CustomerNote>(r.data);
  },
  updateNote: async (id: string, payload: { content?: string; category?: NoteCategory; isPinned?: boolean }): Promise<CustomerNote> => {
    const r = await api.patch(`${CRM_BASE}/notes/${id}`, payload);
    return unwrap<CustomerNote>(r.data);
  },
  deleteNote: async (id: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${CRM_BASE}/notes/${id}`);
    return unwrap<{ success: boolean }>(r.data);
  },

  // ---- Tickets ----
  getTickets: async (params: { pageNumber?: number; pageSize?: number; status?: string; priority?: string; category?: string; assignedTo?: string; search?: string }): Promise<TicketListResult> => {
    const r = await api.get(`${CRM_BASE}/tickets`, { params });
    return unwrap<TicketListResult>(r.data);
  },
  getTicketStats: async (): Promise<TicketStats> => {
    const r = await api.get(`${CRM_BASE}/tickets/stats`);
    return unwrap<TicketStats>(r.data);
  },
  getTicket: async (id: string): Promise<SupportTicket> => {
    const r = await api.get(`${CRM_BASE}/tickets/${id}`);
    return unwrap<SupportTicket>(r.data);
  },
  assignTicket: async (id: string): Promise<SupportTicket> => {
    const r = await api.patch(`${CRM_BASE}/tickets/${id}/assign`);
    return unwrap<SupportTicket>(r.data);
  },
  updateTicketStatus: async (id: string, status: TicketStatus): Promise<SupportTicket> => {
    const r = await api.patch(`${CRM_BASE}/tickets/${id}/status`, { status });
    return unwrap<SupportTicket>(r.data);
  },
  addTicketMessage: async (id: string, payload: { message: string; isInternal?: boolean; attachments?: any[] }): Promise<TicketMessage> => {
    const r = await api.post(`${CRM_BASE}/tickets/${id}/messages`, payload);
    return unwrap<TicketMessage>(r.data);
  },

  // ---- Tags ----
  getTags: async (): Promise<CustomerTag[]> => {
    const r = await api.get(`${CRM_BASE}/tags`);
    return unwrap<CustomerTag[]>(r.data);
  },
  createTag: async (payload: { name: string; color: string }): Promise<CustomerTag> => {
    const r = await api.post(`${CRM_BASE}/tags`, payload);
    return unwrap<CustomerTag>(r.data);
  },
  updateTag: async (id: string, payload: { name?: string; color?: string }): Promise<CustomerTag> => {
    const r = await api.patch(`${CRM_BASE}/tags/${id}`, payload);
    return unwrap<CustomerTag>(r.data);
  },
  deleteTag: async (id: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${CRM_BASE}/tags/${id}`);
    return unwrap<{ success: boolean }>(r.data);
  },
  assignTag: async (userId: string, tagId: string): Promise<CustomerTag> => {
    const r = await api.post(`${CRM_BASE}/users/${userId}/tags/${tagId}`);
    return unwrap<CustomerTag>(r.data);
  },
  unassignTag: async (userId: string, tagId: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${CRM_BASE}/users/${userId}/tags/${tagId}`);
    return unwrap<{ success: boolean }>(r.data);
  },

  // ---- Segments ----
  getSegments: async (): Promise<CustomerSegment[]> => {
    const r = await api.get(`${CRM_BASE}/segments`);
    return unwrap<CustomerSegment[]>(r.data);
  },
  createSegment: async (payload: { name: string; description?: string; criteria: Record<string, any>; isDynamic?: boolean }): Promise<CustomerSegment> => {
    const r = await api.post(`${CRM_BASE}/segments`, payload);
    return unwrap<CustomerSegment>(r.data);
  },
  updateSegment: async (id: string, payload: { name?: string; description?: string; criteria?: Record<string, any>; isDynamic?: boolean }): Promise<CustomerSegment> => {
    const r = await api.patch(`${CRM_BASE}/segments/${id}`, payload);
    return unwrap<CustomerSegment>(r.data);
  },
  deleteSegment: async (id: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${CRM_BASE}/segments/${id}`);
    return unwrap<{ success: boolean }>(r.data);
  },
  evaluateSegment: async (id: string): Promise<string[]> => {
    const r = await api.post(`${CRM_BASE}/segments/${id}/evaluate`);
    return unwrap<string[]>(r.data);
  },
  assignSegment: async (id: string, userIds: string[]): Promise<{ success: boolean }> => {
    const r = await api.post(`${CRM_BASE}/segments/${id}/assign`, { userIds });
    return unwrap<{ success: boolean }>(r.data);
  },
  assignUserToSegment: async (userId: string, segmentId: string): Promise<{ success: boolean }> => {
    const r = await api.post(`${CRM_BASE}/users/${userId}/segments/${segmentId}`);
    return unwrap<{ success: boolean }>(r.data);
  },
  unassignUserFromSegment: async (userId: string, segmentId: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${CRM_BASE}/users/${userId}/segments/${segmentId}`);
    return unwrap<{ success: boolean }>(r.data);
  },

  // ---- Communications ----
  getCommunications: async (userId: string, pageNumber = 1, pageSize = 50): Promise<{ data: CommunicationLog[]; total: number }> => {
    const r = await api.get(`${CRM_BASE}/users/${userId}/communications`, { params: { pageNumber, pageSize } });
    return unwrap<{ data: CommunicationLog[]; total: number }>(r.data);
  },
};
