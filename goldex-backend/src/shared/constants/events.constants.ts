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
  CASHED_OUT: "credit.cashed_out",
  REMINDER: "credit.reminder",
  PRICE_UPDATE: "credit.price_update",
  SETTLEMENT_STATE_CHANGED: "credit.settlement_state_changed",
  RISK_STATE_CHANGED: "credit.risk_state_changed",
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

export const P2pEvents = {
  MATCHED: "p2p.matched",
  PROOF_SUBMITTED: "p2p.proof_submitted",
  CONFIRMED: "p2p.confirmed",
  REJECTED: "p2p.rejected",
  RESPONSE_TIMEOUT: "p2p.response_timeout",
  RESERVATION_EXPIRED: "p2p.reservation_expired",
  ESCALATED: "p2p.escalated",
  ESCALATION_RESOLVED: "p2p.escalation_resolved",
  NO_MATCH: "p2p.no_match",
  WITHDRAW_COMPLETED: "p2p.withdraw_completed",
} as const;
