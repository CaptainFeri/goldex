export enum ArbitrageBotStatusEnum {
  /** Created but never funded or started. */
  DRAFT = "DRAFT",
  /** Funded and evaluating live signals. */
  RUNNING = "RUNNING",
  /** Temporarily off; the allocation stays frozen. */
  PAUSED = "PAUSED",
  /** Stopped by its owner; the allocation has been released. */
  STOPPED = "STOPPED",
  /**
   * Stopped by the risk rules, not by a person — the stop-loss was reached.
   * A halted bot needs an explicit decision before it trades again.
   */
  HALTED = "HALTED",
}

/** What the bot is allowed to do when an opportunity matches. */
export enum ArbitrageBotExecutionModeEnum {
  /** Record the opportunity and notify. Nothing is ordered. */
  SIGNAL_ONLY = "SIGNAL_ONLY",
  /** Place both legs with the providers automatically. */
  AUTO = "AUTO",
}

export enum ArbitrageBotTradeStatusEnum {
  /** Matched and sized, not yet sent anywhere. */
  PLANNED = "PLANNED",
  /** Both legs submitted to the providers. */
  SUBMITTED = "SUBMITTED",
  /** Both legs confirmed. */
  FILLED = "FILLED",
  /** One or both legs were rejected. */
  FAILED = "FAILED",
  /** Abandoned before submission (bot stopped, deadline passed). */
  CANCELLED = "CANCELLED",
}

/** Things a bot can tell its owner about. */
export enum ArbitrageBotEventTypeEnum {
  SIGNAL_MATCHED = "SIGNAL_MATCHED",
  TRADE_SUBMITTED = "TRADE_SUBMITTED",
  TRADE_FILLED = "TRADE_FILLED",
  TRADE_FAILED = "TRADE_FAILED",
  LOSS_WARNING = "LOSS_WARNING",
  STOP_LOSS_HIT = "STOP_LOSS_HIT",
  STATUS_CHANGED = "STATUS_CHANGED",
  ERROR = "ERROR",
}

export enum ArbitrageBotEventSeverityEnum {
  INFO = "INFO",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

/** Where a bot's notifications go. */
export enum ArbitrageBotNotifyChannelEnum {
  /** The admin panel's real-time feed. */
  ADMIN_PANEL = "ADMIN_PANEL",
  TELEGRAM = "TELEGRAM",
  SMS = "SMS",
}
