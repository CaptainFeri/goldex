export type BotStatus = "DRAFT" | "RUNNING" | "PAUSED" | "STOPPED" | "HALTED";
export type BotExecutionMode = "SIGNAL_ONLY" | "AUTO";
export type BotNotifyChannel = "ADMIN_PANEL" | "TELEGRAM" | "SMS";
export type BotEventType =
  | "SIGNAL_MATCHED"
  | "TRADE_SUBMITTED"
  | "TRADE_FILLED"
  | "TRADE_FAILED"
  | "LOSS_WARNING"
  | "STOP_LOSS_HIT"
  | "STATUS_CHANGED"
  | "ERROR";

export interface BotScope {
  pricePairIds: string[];
  marketTypes: string[];
  providerKeys: string[];
  itemIds: number[];
}

export interface BotThresholds {
  minProfitRial: number;
  minProfitPercent: number;
  maxTradeVolume: number;
  maxOpenTrades: number;
  maxTradesPerHour: number;
  cooldownSeconds: number;
  maxQuoteAgeSeconds: number;
}

export interface BotNotifications {
  enabled: boolean;
  channels: BotNotifyChannel[];
  events: BotEventType[];
  lossWarningPercent: number;
  minProfitToNotifyRial: number;
  throttleSeconds: number;
  telegramChatId?: string | null;
  smsPhone?: string | null;
}

export interface ArbitrageBot {
  id: string;
  name: string;
  description: string | null;
  status: BotStatus;
  executionMode: BotExecutionMode;
  ownerAdminId: string;
  owner: { id: string; phone?: string; email?: string } | null;
  scope: BotScope;
  thresholds: BotThresholds;
  notifications: BotNotifications;
  managerAccountId: string | null;
  symbolId: string | null;
  symbol: { id: string; name: string; slug: string } | null;
  allocatedAmount: number;
  stopLossPercent: number;
  stopLossAmount: number;
  realizedPnl: number;
  realizedLoss: number;
  lossBudgetRemaining: number;
  lossBudgetUsedPercent: number;
  startedAt: string | null;
  stoppedAt: string | null;
  haltedAt: string | null;
  haltReason: string | null;
  lastSignalAt: string | null;
  lastTradeAt: string | null;
  matchedSignals: number;
  totalTrades: number;
  /** Provider orders placed — two per completed cycle. */
  totalTransactions: number;
}

/** Which leg a bot's own capital pays for first. */
export type BotFundingDirection = "BUY_FIRST" | "SELL_FIRST";

export const DIRECTION_LABEL: Record<BotFundingDirection, string> = {
  BUY_FIRST: "خرید سپس فروش",
  SELL_FIRST: "فروش سپس خرید",
};

/** Section-wide KPIs, as returned by /admin/arbitrage/bots/summary. */
export interface ArbitrageBotSummary {
  totalBots: number;
  running: number;
  paused: number;
  halted: number;
  stopped: number;
  draft: number;
  autoExecuting: number;
  allocatedRial: number;
  allocations: { symbol: string; amount: number; valueRial: number | null }[];
  unpricedAssets: string[];
  lossBudgetRemaining: number;
  matchedSignals: number;
  totalTrades: number;
  totalTransactions: number;
  openTrades: number;
  tradesLastDay: number;
  transactionsLastDay: number;
  settledLastDay: number;
  filledLastDay: number;
  failedLastDay: number;
  fillRateLastDay: number | null;
  profitLastDayRial: number;
  totalProfitRial: number;
  lastSignalAt: string | null;
}

export interface ManagerAccount {
  id: string;
  adminId: string;
  admin: { id: string; phone?: string; email?: string; role?: string } | null;
  symbolId: string;
  symbol: { id: string; name: string; slug: string } | null;
  availableBalance: number;
  allocatedBalance: number;
  totalBalance: number;
  status: "ACTIVE" | "SUSPENDED";
  note: string | null;
}

export const BOT_STATUS_LABEL: Record<BotStatus, string> = {
  DRAFT: "پیش‌نویس",
  RUNNING: "در حال اجرا",
  PAUSED: "موقتاً متوقف",
  STOPPED: "متوقف",
  HALTED: "توقف اضطراری (حد ضرر)",
};

export const BOT_STATUS_KIND: Record<BotStatus, "green" | "red" | "gold" | "gray" | "blue"> = {
  DRAFT: "gray",
  RUNNING: "green",
  PAUSED: "gold",
  STOPPED: "gray",
  HALTED: "red",
};

export const EXECUTION_MODE_LABEL: Record<BotExecutionMode, string> = {
  SIGNAL_ONLY: "فقط اعلام سیگنال",
  AUTO: "اجرای خودکار سفارش",
};

export const CHANNEL_LABEL: Record<BotNotifyChannel, string> = {
  ADMIN_PANEL: "پنل مدیریت",
  TELEGRAM: "تلگرام",
  SMS: "پیامک",
};

export const EVENT_LABEL: Record<BotEventType, string> = {
  SIGNAL_MATCHED: "فرصت منطبق",
  TRADE_SUBMITTED: "ثبت سفارش",
  TRADE_FILLED: "انجام معامله",
  TRADE_FAILED: "شکست معامله",
  LOSS_WARNING: "هشدار زیان",
  STOP_LOSS_HIT: "رسیدن به حد ضرر",
  STATUS_CHANGED: "تغییر وضعیت",
  ERROR: "خطا",
};
