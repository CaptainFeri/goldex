import { Controller, Post, Body, Logger } from "@nestjs/common";
import { TelegramNotifierService } from "./telegram-notifier.service";
import { UserTelegramService } from "../user-telegram/user-telegram.service";
import { MatchService } from "../order/match.service";
import { QuoteRequestService } from "../quote-request/quote-request.service";

interface CallbackQuery {
  id: string;
  from: { id: number; username?: string; first_name?: string };
  data: string;
  message?: { chat?: { id?: number } };
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: CallbackQuery;
}

@Controller("api/telegram")
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly notifier: TelegramNotifierService,
    private readonly userTelegram: UserTelegramService,
    private readonly matchService: MatchService,
    private readonly quoteRequest: QuoteRequestService,
  ) {}

  @Post("webhook")
  async handleUpdate(@Body() update: TelegramUpdate) {
    this.logger.debug(`Telegram update received: ${update.update_id}`);

    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || "";
      const telegramId = cq.from.id;

      if (data.startsWith("match:")) {
        const orderId = data.slice(6);
        return this.handleMatchRequest(cq.id, telegramId, orderId);
      }

      if (data.startsWith("qmatch:")) {
        const requestId = data.slice(7);
        return this.handleQuoteMatch(cq.id, telegramId, requestId);
      }

      await this.notifier.answerCallbackQuery(cq.id, "❌ دکمه ناشناخته");
    }
  }

  private async handleMatchRequest(callbackQueryId: string, telegramId: number, orderId: string) {
    try {
      const link = await this.userTelegram.findByTelegramId(telegramId);
      if (!link) {
        await this.notifier.answerCallbackQuery(
          callbackQueryId,
          "❌ ابتدا حساب خود را به ربات متصل کنید.\nبا /start شروع کنید.",
          true,
        );
        return;
      }

      const result = await this.matchService.requestMatch(orderId, link.userId);
      await this.notifier.answerCallbackQuery(
        callbackQueryId,
        result.message,
        result.showAlert,
      );
    } catch (err) {
      this.logger.error(`Match error for order ${orderId}: ${(err as Error).message}`);
      await this.notifier.answerCallbackQuery(
        callbackQueryId,
        `❌ خطا: ${(err as Error).message}`,
        true,
      );
    }
  }

  private async handleQuoteMatch(callbackQueryId: string, telegramId: number, requestId: string) {
    try {
      const link = await this.userTelegram.findByTelegramId(telegramId);
      if (!link) {
        await this.notifier.answerCallbackQuery(
          callbackQueryId,
          "❌ ابتدا حساب خود را به ربات متصل کنید.\nبا /start شروع کنید.",
          true,
        );
        return;
      }

      await this.quoteRequest.match(requestId, link.userId);
      await this.notifier.answerCallbackQuery(
        callbackQueryId,
        "✅ درخواست با موفقیت تطبیق یافت! جزئیات در ربات برای شما ارسال شد.",
        false,
      );
    } catch (err) {
      this.logger.error(`Quote match error for request ${requestId}: ${(err as Error).message}`);
      await this.notifier.answerCallbackQuery(
        callbackQueryId,
        `❌ ${(err as Error).message}`,
        true,
      );
    }
  }
}
