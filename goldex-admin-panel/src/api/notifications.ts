import { api, unwrap } from "./client";

export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "PROMOTION" | "SYSTEM";
export type NotificationCategory = "TRADE" | "CREDIT" | "KYC" | "SECURITY" | "PROMOTION" | "SYSTEM" | "SUPPORT";
export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "TELEGRAM" | "PUSH";
export type NotificationStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface NotificationItem {
  id: string;
  userId: string;
  user?: { phone?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null };
  type: NotificationType;
  category: NotificationCategory;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, any>;
  status: NotificationStatus;
  readAt?: string | null;
  sentAt?: string;
  deliveredAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  createAt: string;
}

export interface NotificationStats {
  total: number;
  byChannel: { channel: NotificationChannel; count: number }[];
  byStatus: { status: NotificationStatus; count: number }[];
}

export interface NotificationListResult {
  data: NotificationItem[];
  total: number;
}

export interface NotificationTemplate {
  id: string;
  slug: string;
  title: string;
  channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }>;
  createAt?: string;
  updateAt?: string;
}

export interface SendNotificationPayload {
  userId: string;
  type?: NotificationType;
  category?: NotificationCategory;
  title: string;
  body: string;
  channels?: NotificationChannel[];
  userEmail?: string;
  userPhone?: string;
}

export interface SendToSegmentPayload {
  segmentId: string;
  mode?: "dynamic" | "manual";
  type?: NotificationType;
  category?: NotificationCategory;
  title?: string;
  body?: string;
  templateSlug?: string;
  variables?: Record<string, any>;
  channels?: NotificationChannel[];
}

export interface BroadcastSegmentResult {
  segmentId: string;
  targetCount: number;
  createdCount: number;
  skippedCount: number;
}

const NOTIF_BASE = "/admin/notifications";

export const notificationApi = {
  getStats: async (): Promise<NotificationStats> => {
    const r = await api.get(`${NOTIF_BASE}/stats`);
    return unwrap<NotificationStats>(r.data);
  },

  list: async (params: {
    pageNumber?: number;
    pageSize?: number;
    userId?: string;
    type?: string;
    channel?: string;
    status?: string;
  }): Promise<NotificationListResult> => {
    const r = await api.get(NOTIF_BASE, { params });
    return unwrap<NotificationListResult>(r.data);
  },

  send: async (payload: SendNotificationPayload): Promise<NotificationItem[]> => {
    const r = await api.post(`${NOTIF_BASE}/send`, payload);
    return unwrap<NotificationItem[]>(r.data);
  },

  sendToSegment: async (payload: SendToSegmentPayload): Promise<BroadcastSegmentResult> => {
    const r = await api.post(`${NOTIF_BASE}/send-to-segment`, payload);
    return unwrap<BroadcastSegmentResult>(r.data);
  },

  getUserNotifications: async (userId: string, pageNumber = 1, pageSize = 50): Promise<NotificationListResult> => {
    const r = await api.get(`${NOTIF_BASE}/user/${userId}`, { params: { pageNumber, pageSize } });
    return unwrap<NotificationListResult>(r.data);
  },

  // ---- Templates ----
  listTemplates: async (): Promise<NotificationTemplate[]> => {
    const r = await api.get(`${NOTIF_BASE}/templates`);
    return unwrap<NotificationTemplate[]>(r.data);
  },

  getTemplate: async (slug: string): Promise<NotificationTemplate> => {
    const r = await api.get(`${NOTIF_BASE}/templates/${slug}`);
    return unwrap<NotificationTemplate>(r.data);
  },

  createTemplate: async (payload: { slug: string; title: string; channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }> }): Promise<NotificationTemplate> => {
    const r = await api.post(`${NOTIF_BASE}/templates`, payload);
    return unwrap<NotificationTemplate>(r.data);
  },

  updateTemplate: async (slug: string, payload: { title?: string; channelsConfig?: Record<string, { enabled: boolean; subject?: string; body: string }> }): Promise<NotificationTemplate> => {
    const r = await api.patch(`${NOTIF_BASE}/templates/${slug}`, payload);
    return unwrap<NotificationTemplate>(r.data);
  },

  deleteTemplate: async (slug: string): Promise<{ success: boolean }> => {
    const r = await api.delete(`${NOTIF_BASE}/templates/${slug}`);
    return unwrap<{ success: boolean }>(r.data);
  },
};
