import { ArbitrageBotEventTypeEnum, ArbitrageBotNotifyChannelEnum } from "./enum/arbitrage-bot.enums";

/**
 * Which opportunities a bot is interested in. Every list is a whitelist, and
 * an empty list means "no restriction on this dimension" — so a brand-new bot
 * watches everything until its owner narrows it.
 */
export interface ArbitrageBotScope {
  /** Price pairs the bot trades (empty = any pair). */
  pricePairIds: string[];
  /** Markets the bot trades in — formal, informal (empty = any market). */
  marketTypes: string[];
  /** Providers allowed on either leg (empty = any provider). */
  providerKeys: string[];
  /** Provider item ids to watch (empty = any item). */
  itemIds: number[];
}

/** The conditions an opportunity must clear before the bot acts on it. */
export interface ArbitrageBotThresholds {
  /** Absolute profit floor, in Rial, for one trade. */
  minProfitRial: number;
  /** Percentage profit floor for one trade. */
  minProfitPercent: number;
  /**
   * Largest position the bot opens at once, counted in the traded item's own
   * unit — the same `count` the provider order carries. Zero means the only
   * limit is the loss budget. The allocation's asset denominates the *budget*,
   * not the order size, which is why these are different units.
   */
  maxTradeVolume: number;
  /** How many submitted-but-unsettled trades may exist at once. */
  maxOpenTrades: number;
  /** Cap on new trades in any rolling hour. */
  maxTradesPerHour: number;
  /** Quiet period after a trade before the bot may act again. */
  cooldownSeconds: number;
  /** Refuse a signal whose quotes are older than this. */
  maxQuoteAgeSeconds: number;
}

/**
 * Per-bot notification policy. Notifications are the point of a signal-only
 * bot, so every event type is individually switchable and the channels are
 * per bot rather than global.
 */
export interface ArbitrageBotNotificationConfig {
  enabled: boolean;
  channels: ArbitrageBotNotifyChannelEnum[];
  /** Event types that actually notify; others are recorded silently. */
  events: ArbitrageBotEventTypeEnum[];
  /** Warn once the bot has consumed this share of its stop-loss budget. */
  lossWarningPercent: number;
  /** Do not notify about matched signals smaller than this (Rial). */
  minProfitToNotifyRial: number;
  /** Minimum gap between notifications of the same event type. */
  throttleSeconds: number;
  /** Telegram chat to notify; falls back to the service's default chat. */
  telegramChatId?: string | null;
  /** Phone for SMS alerts; falls back to the owning admin's phone. */
  smsPhone?: string | null;
}

export const DEFAULT_BOT_SCOPE: ArbitrageBotScope = {
  pricePairIds: [],
  marketTypes: [],
  providerKeys: [],
  itemIds: [],
};

export const DEFAULT_BOT_THRESHOLDS: ArbitrageBotThresholds = {
  minProfitRial: 0,
  minProfitPercent: 0,
  maxTradeVolume: 0,
  maxOpenTrades: 1,
  maxTradesPerHour: 10,
  cooldownSeconds: 30,
  maxQuoteAgeSeconds: 30,
};

/**
 * Quiet by default on everything except the events an owner needs to see:
 * a bot that pages on every matched signal is a bot whose alerts get ignored.
 */
export const DEFAULT_BOT_NOTIFICATIONS: ArbitrageBotNotificationConfig = {
  enabled: true,
  channels: [ArbitrageBotNotifyChannelEnum.ADMIN_PANEL],
  events: [
    ArbitrageBotEventTypeEnum.TRADE_SUBMITTED,
    ArbitrageBotEventTypeEnum.TRADE_FILLED,
    ArbitrageBotEventTypeEnum.TRADE_FAILED,
    ArbitrageBotEventTypeEnum.LOSS_WARNING,
    ArbitrageBotEventTypeEnum.STOP_LOSS_HIT,
    ArbitrageBotEventTypeEnum.ERROR,
  ],
  lossWarningPercent: 70,
  minProfitToNotifyRial: 0,
  throttleSeconds: 60,
  telegramChatId: null,
  smsPhone: null,
};
