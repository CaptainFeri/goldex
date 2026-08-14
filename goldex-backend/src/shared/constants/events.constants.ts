export const NotificationEvents = {
  SEND: "notification.send",
  SENT: "notification.sent",
  READ: "notification.read",
  READ_ALL: "notification.read-all",
} as const;

export const TicketEvents = {
  CREATED: "ticket.created",
  ASSIGNED: "ticket.assigned",
  STATUS_CHANGED: "ticket.status_changed",
  MESSAGE_ADDED: "ticket.message_added",
} as const;

export const CreditEvents = {
  EXPIRED: "credit.expired",
  MARGIN_CALL: "credit.margin_call",
  SETTLED: "credit.settled",
  REMINDER: "credit.reminder",
} as const;

export const KycEvents = {
  APPROVED: "kyc.approved",
  REJECTED: "kyc.rejected",
  DOCUMENT_REQUIRED: "kyc.document_required",
} as const;

export const OrderEvents = {
  PLACED: "order.placed",
  MATCHED: "order.matched",
  CANCELLED: "order.cancelled",
} as const;

export const UserEvents = {
  REGISTERED: "user.registered",
  PASSWORD_CHANGED: "user.password_changed",
  BLOCKED: "user.blocked",
  UNBLOCKED: "user.unblocked",
} as const;
