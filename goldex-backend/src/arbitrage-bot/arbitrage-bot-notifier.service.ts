import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ArbitrageBotEntity } from "./entity/arbitrage-bot.entity";
import { ArbitrageBotEventEntity } from "./entity/arbitrage-bot-event.entity";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
  ArbitrageBotNotifyChannelEnum,
} from "./enum/arbitrage-bot.enums";
import { DEFAULT_BOT_NOTIFICATIONS } from "./arbitrage-bot.types";
import { AdminNotificationGateway } from "../notification/admin-notification.gateway";
import { TelegramNotifierService } from "../telegram-notifier/telegram-notifier.service";
import { SmsService } from "../sms/sms.service";
import { AdminEntity } from "../admin/entity/admin.entity";

/**
 * Delivers a bot's events according to that bot's own notification policy.
 *
 * A bot in signal-only mode is nothing but its notifications, so the policy is
 * per bot rather than global: which events are worth an alert, on which
 * channels, how often, and above what profit. Everything is still recorded as
 * an event either way — this decides only what leaves the system.
 *
 * Delivery is best-effort by design. A Telegram outage must not stop a bot
 * from trading or from booking its losses, so a failed channel is logged and
 * omitted from the event's `notifiedChannels` rather than thrown.
 */
@Injectable()
export class ArbitrageBotNotifierService {
  private readonly logger = new Logger(ArbitrageBotNotifierService.name);

  /** Last delivery per bot and event type, for the per-bot throttle. */
  private readonly lastSentAt = new Map<string, number>();

  constructor(
    private readonly adminGateway: AdminNotificationGateway,
    private readonly telegram: TelegramNotifierService,
    private readonly sms: SmsService,
    @InjectRepository(AdminEntity)
    private readonly adminRepo: Repository<AdminEntity>
  ) {}

  /**
   * Sends one event and returns the channels it actually went out on. An
   * empty result means the policy suppressed it or every channel failed.
   */
  async dispatch(
    bot: ArbitrageBotEntity,
    event: ArbitrageBotEventEntity
  ): Promise<ArbitrageBotNotifyChannelEnum[]> {
    const config = { ...DEFAULT_BOT_NOTIFICATIONS, ...(bot.notifications ?? {}) };

    if (!config.enabled) return [];
    if (!config.events?.includes(event.type)) return [];
    if (!this.passesProfitFloor(config.minProfitToNotifyRial, event)) return [];

    // Critical events are never throttled: the whole point of a stop-loss
    // alert is that it arrives the first time it is true.
    const throttled =
      event.severity !== ArbitrageBotEventSeverityEnum.CRITICAL &&
      !this.passesThrottle(bot.id, event.type, config.throttleSeconds);
    if (throttled) return [];

    const delivered: ArbitrageBotNotifyChannelEnum[] = [];
    for (const channel of config.channels ?? []) {
      try {
        const sent = await this.send(channel, bot, event, config.telegramChatId, config.smsPhone);
        if (sent) delivered.push(channel);
      } catch (err) {
        this.logger.warn(
          `bot ${bot.id} ${channel} notification failed: ${(err as Error).message}`
        );
      }
    }

    if (delivered.length > 0) {
      this.lastSentAt.set(this.throttleKey(bot.id, event.type), Date.now());
    }
    return delivered;
  }

  // ── Channels ─────────────────────────────────────────────────────────────

  private async send(
    channel: ArbitrageBotNotifyChannelEnum,
    bot: ArbitrageBotEntity,
    event: ArbitrageBotEventEntity,
    telegramChatId?: string | null,
    smsPhone?: string | null
  ): Promise<boolean> {
    switch (channel) {
      case ArbitrageBotNotifyChannelEnum.ADMIN_PANEL:
        this.adminGateway.sendToAdmins({
          event: `arbitrage-bot.${event.type.toLowerCase()}`,
          title: event.title,
          body: event.message,
          type: this.panelType(event.severity),
          metadata: { botId: bot.id, botName: bot.name, ...(event.metadata ?? {}) },
        });
        return true;

      case ArbitrageBotNotifyChannelEnum.TELEGRAM: {
        const text = `🤖 ${event.title}\n${event.message}`;
        if (telegramChatId) {
          await this.telegram.sendDirectMessage(Number(telegramChatId), text);
        } else {
          await this.telegram.sendMessage(text);
        }
        return true;
      }

      case ArbitrageBotNotifyChannelEnum.SMS: {
        const phone = smsPhone ?? (await this.ownerPhone(bot.ownerAdminId));
        if (!phone) {
          this.logger.warn(`bot ${bot.id} has no SMS recipient; skipping`);
          return false;
        }
        const result = await this.sms.sendSMS(phone, `${event.title} — ${event.message}`);
        return result.success;
      }

      default:
        return false;
    }
  }

  private async ownerPhone(adminId: string): Promise<string | null> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    return admin?.phone ?? null;
  }

  // ── Policy ───────────────────────────────────────────────────────────────

  /**
   * The profit floor only filters events that carry a profit figure. A
   * stop-loss or an error has no profit to compare and must always pass.
   */
  private passesProfitFloor(floor: number, event: ArbitrageBotEventEntity): boolean {
    if (!floor || floor <= 0) return true;
    const profit = Number(event.metadata?.expectedProfitRial ?? event.metadata?.profitRial);
    if (!Number.isFinite(profit)) return true;
    return profit >= floor;
  }

  private passesThrottle(botId: string, type: ArbitrageBotEventTypeEnum, seconds: number): boolean {
    if (!seconds || seconds <= 0) return true;
    const last = this.lastSentAt.get(this.throttleKey(botId, type));
    return last === undefined || Date.now() - last >= seconds * 1000;
  }

  private throttleKey(botId: string, type: ArbitrageBotEventTypeEnum): string {
    return `${botId}:${type}`;
  }

  private panelType(severity: ArbitrageBotEventSeverityEnum): string {
    switch (severity) {
      case ArbitrageBotEventSeverityEnum.CRITICAL:
        return "error";
      case ArbitrageBotEventSeverityEnum.WARNING:
        return "warning";
      default:
        return "info";
    }
  }
}
