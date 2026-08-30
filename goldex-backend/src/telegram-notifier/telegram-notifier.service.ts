import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

@Injectable()
export class TelegramNotifierService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramNotifierService.name);
  private readonly botToken: string;
  private readonly channelId: string;
  private readonly apiBase: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.botToken = this.config.get<string>("telegram.botToken");
    this.channelId = this.config.get<string>("telegram.channelId");
    this.baseUrl = this.config.get<string>("application.url");
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async onApplicationBootstrap() {
    const webhookUrl = this.baseUrl
      ? `${this.baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`
      : "";
    if (webhookUrl) {
      await this.setWebhook(webhookUrl);
    }
  }

  get botApiBase(): string {
    return this.apiBase;
  }

  async sendMessage(text: string, replyMarkup?: Record<string, unknown>): Promise<{ chatId: number; messageId: number } | null> {
    if (!this.botToken || !this.channelId) {
      this.logger.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not configured — skipping channel notification");
      return null;
    }

    try {
      const res = await firstValueFrom(
        this.http.post(`${this.apiBase}/sendMessage`, {
          chat_id: this.channelId,
          text,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      );
      const result = res.data?.result;
      return result ? { chatId: result.chat?.id, messageId: result.message_id } : null;
    } catch (err) {
      this.logger.error(`Failed to send Telegram notification: ${(err as Error).message}`);
      return null;
    }
  }

  async editMessageText(chatId: number | string, messageId: number | string, text: string, replyMarkup?: Record<string, unknown> | null): Promise<void> {
    if (!this.botToken) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text,
          parse_mode: "Markdown",
          reply_markup: replyMarkup,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to edit message ${messageId}: ${(err as Error).message}`);
    }
  }

  async sendOrderWithMatchButton(text: string, orderId: string): Promise<void> {
    await this.sendMessage(text, {
      inline_keyboard: [[
        {
          text: "درخواست تطابق",
          callback_data: `match:${orderId}`,
        },
      ]],
    });
  }

  async sendDirectMessage(chatId: number, text: string): Promise<void> {
    if (!this.botToken) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not configured — skipping direct message");
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/sendMessage`, {
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to send direct message to ${chatId}: ${(err as Error).message}`);
    }
  }

  async sendQuoteRequestToChannel(
    text: string,
    requestId: string,
  ): Promise<{ chatId: number; messageId: number } | null> {
    return this.sendMessage(text, {
      inline_keyboard: [[
        {
          text: "✅ درخواست تطابق",
          callback_data: `qmatch:${requestId}`,
        },
      ]],
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text: string, showAlert = false): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/answerCallbackQuery`, {
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to answer callback query: ${(err as Error).message}`);
    }
  }

  async setWebhook(url: string): Promise<void> {
    if (!this.botToken) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/setWebhook`, { url }),
      );
      this.logger.log(`Telegram webhook set to ${url}`);
    } catch (err) {
      this.logger.error(`Failed to set Telegram webhook: ${(err as Error).message}`);
    }
  }
}
