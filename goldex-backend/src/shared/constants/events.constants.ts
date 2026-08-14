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
  REJECTED: "order.rejected",
} as const;

export const UserEvents = {
  REGISTERED: "user.registered",
  REFERRAL: "user.referral",
  PASSWORD_CHANGED: "user.password_changed",
  BLOCKED: "user.blocked",
  UNBLOCKED: "user.unblocked",
  LEVEL_CHANGED: "user.level_changed",
  LEVEL_UNASSIGNED: "user.level_unassigned",
} as const;

export const DepositEvents = {
  CREATED: "deposit.created",
  COMPLETED: "deposit.completed",
  FAILED: "deposit.failed",
  CANCELLED: "deposit.cancelled",
} as const;

export const WithdrawEvents = {
  CREATED: "withdraw.created",
  COMPLETED: "withdraw.completed",
  FAILED: "withdraw.failed",
  CANCELLED: "withdraw.cancelled",
} as const;
