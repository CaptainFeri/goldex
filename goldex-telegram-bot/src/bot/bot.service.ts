import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import appEnvConfig from '../config/app.env.config';
import { UserService } from '../user/user.service';
import { BackendApiService } from '../backend-api/backend-api.service';
import { UserState } from '../user/entity/telegram-user.entity';
import { ChannelService } from '../channel/channel.service';

const MAIN_MENU: TelegramBot.KeyboardButton[][] = [
  [{ text: '💼 کیف پول' }, { text: '👤 پروفایل' }],
  [{ text: '📊 خرید/فروش سفارشی' }, { text: '📋 سفارشات من' }],
  [{ text: '❓ راهنما' }],
];

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: TelegramBot;

  /** Maps order ID → channel message info for deletion on cancel. */
  private readonly channelMessages = new Map<
    string,
    { chatId: number; messageId: number }
  >();

  /** Tracks orders across all users for local matching. */
  private readonly activeOrders = new Map<
    string,
    {
      orderId: string;
      chatId: number;
      userId: string;
      side: string;
      price: number | null;
      quantity: number;
      pairLabel: string;
      pricePairId: string;
      pairQuoteSymbolId: string | undefined;
      status: string;
    }
  >();

  constructor(
    private readonly configService: ConfigService<
      ConfigType<typeof appEnvConfig>
    >,
    private readonly userService: UserService,
    private readonly backendApi: BackendApiService,
    private readonly channelService: ChannelService,
  ) {}

  onModuleInit() {
    const token = this.configService.get('bot', { infer: true }).token;
    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN is not set');
      return;
    }
    this.bot = new TelegramBot(token, { polling: true });
    this.logger.log('Bot started with long-polling');
    this.registerHandlers();
    this.startOrderMonitor();
  }

  onModuleDestroy() {
    if (this.bot) {
      this.bot.stopPolling();
    }
  }

  private registerHandlers() {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/wallet/, (msg) => this.handleWallet(msg));
    this.bot.onText(/\/profile/, (msg) => this.handleProfile(msg));
    this.bot.onText(/\/balance/, (msg) => this.handleWallet(msg));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));

    this.bot.on('contact', (msg) => this.handleContact(msg));
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
    this.bot.on('message', (msg) => this.handleMessage(msg));
  }

  private mainMenuReply(): TelegramBot.SendMessageOptions {
    return {
      reply_markup: {
        keyboard: MAIN_MENU,
        resize_keyboard: true,
      },
    };
  }

  private async handleStart(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const user = await this.userService.findOrCreate(chatId, {
      firstName: msg.from?.first_name,
      lastName: msg.from?.last_name,
      username: msg.from?.username,
    });

    if (user.state === UserState.AUTHENTICATED) {
      await this.sendMessage(
        chatId,
        `👋 ${user.firstName ? user.firstName + ' عزیز، ' : ''}خوش آمدید!`,
        this.mainMenuReply(),
      );
      return;
    }

    await this.sendMessage(
      chatId,
      '👋 به ربات پارس زرگر خوش آمدید!\n\nبرای شروع، لطفاً شماره تماس خود را با کلیک روی دکمه زیر به اشتراک بگذارید.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📱 اشتراک‌گذاری شماره تماس', request_contact: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  private async handleContact(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const contact = msg.contact;

    if (!contact || !contact.phone_number) {
      await this.sendMessage(
        chatId,
        '❌ خواندن شماره تماس امکان‌پذیر نبود. لطفاً با /start دوباره تلاش کنید.',
      );
      return;
    }

    const cleaned = contact.phone_number.replace(/\D/g, '');
    let phone: string;

    if (cleaned.startsWith('0') && cleaned.length === 11) {
      phone = cleaned;
    } else if (cleaned.startsWith('98') && cleaned.length === 12) {
      phone = '0' + cleaned.slice(2);
    } else if (cleaned.startsWith('0098') && cleaned.length === 14) {
      phone = '0' + cleaned.slice(4);
    } else {
      phone = cleaned;
    }

    if (!/^09[0-9]{9}$/.test(phone)) {
      await this.sendMessage(
        chatId,
        '❌ شماره تماس نامعتبر است. لطفاً یک شماره تلفن همراه معتبر ایرانی وارد کنید.\nبا /start دوباره تلاش کنید.',
      );
      return;
    }

    await this.userService.setPhone(chatId, phone);

    try {
      await this.backendApi.sendOtp(phone);
      await this.userService.updateState(chatId, UserState.WAITING_FOR_OTP);
      await this.sendMessage(
        chatId,
        '✅ یک کد تایید ۵ رقمی به شماره شما پیامک شد.\n\nلطفاً کد را در زیر وارد کنید.\n\n💡 کد تا ۵ دقیقه معتبر است.',
        { reply_markup: { remove_keyboard: true } },
      );
    } catch (err) {
      this.logger.error(`Send OTP failed for ${phone}: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ ارسال کد تایید با خطا مواجه شد. سرویس پشتیبان در دسترس نیست.\nلطفاً بعداً با /start دوباره تلاش کنید.',
        { reply_markup: { remove_keyboard: true } },
      );
    }
  }

  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (!text || text.startsWith('/')) return;

    const user = await this.userService.findByChatId(chatId);
    if (!user) {
      await this.sendMessage(chatId, 'لطفاً با /start شروع کنید.');
      return;
    }

    if (user.state === UserState.WAITING_FOR_OTP) {
      await this.handleOtpInput(msg, user.phone);
      return;
    }

    if (user.state === UserState.AUTHENTICATED) {
      if (text === '📊 خرید/فروش سفارشی') {
        await this.handleQuoteRequest(chatId);
      } else if (text === '📋 سفارشات من') {
        await this.handleMyOrders(chatId);
      } else {
        await this.handleMenuClick(chatId, text);
      }
      return;
    }

    if (
      user.state === UserState.WAITING_FOR_QUOTE_PAIR ||
      user.state === UserState.WAITING_FOR_QUOTE_SIDE ||
      user.state === UserState.WAITING_FOR_QUOTE_AMOUNT ||
      user.state === UserState.WAITING_FOR_QUOTE_PRICE ||
      user.state === UserState.WAITING_FOR_QUOTE_DESC ||
      user.state === UserState.WAITING_FOR_QUOTE_CONFIRM
    ) {
      await this.handleQuoteInput(msg, user);
    } else if (user.state === UserState.WAITING_FOR_ORDER_CANCEL) {
      await this.handleOrderCancelInput(chatId, user, text);
    }
  }

  private async handleMenuClick(chatId: number, text: string) {
    switch (text) {
      case '💼 کیف پول':
        await this.handleWalletCmd(chatId);
        break;
      case '👤 پروفایل':
        await this.handleProfileCmd(chatId);
        break;
      case '❓ راهنما':
        await this.handleHelpCmd(chatId);
        break;
    }
  }

  private async handleOtpInput(msg: TelegramBot.Message, phone: string) {
    const chatId = msg.chat.id;
    const otp = msg.text!;
    const userId = msg.from?.id;

    if (!/^\d{5}$/.test(otp.trim())) {
      await this.sendMessage(
        chatId,
        '❌ فرمت نامعتبر. لطفاً یک کد ۵ رقمی وارد کنید.',
      );
      return;
    }

    try {
      const result = await this.backendApi.loginWithOtp(phone, otp.trim());

      if (result.requiresRegistration) {
        await this.sendMessage(
          chatId,
          '✅ کد تایید شد! اما این حساب ثبت‌نام را کامل نکرده است.\nلطفاً ابتدا ثبت‌نام خود را در وب‌سایت پارس زرگر کامل کنید، سپس با /start دوباره تلاش کنید.',
        );
        await this.userService.updateState(chatId, UserState.IDLE);
        return;
      }

      if (!result.access_token) {
        await this.sendMessage(
          chatId,
          '⚠️ احراز هویت دو مرحله‌ای فعال است. لطفاً ابتدا احراز هویت دو مرحله‌ای را غیرفعال کرده یا از طریق وب‌سایت وارد شوید.',
        );
        await this.userService.updateState(chatId, UserState.IDLE);
        return;
      }

      await this.userService.authenticate(
        chatId,
        result.userId,
        result.access_token,
        result.refresh_token,
      );

      // Link Telegram user to Goldex user for match notifications
      try {
        await this.backendApi.linkTelegram(result.access_token, chatId);
      } catch (linkErr) {
        this.logger.warn(`Failed to link telegram user: ${linkErr.message}`);
      }

      const channelChatId = this.configService.get('channel', {
        infer: true,
      }).chatId;
      if (channelChatId && userId) {
        await this.ensureChannelMembership(chatId, userId, channelChatId);
      }

      await this.sendMessage(
        chatId,
        '✅ ورود موفق!\n\nاز منوی زیر استفاده کنید:',
        this.mainMenuReply(),
      );
    } catch (err) {
      this.logger.error(`Login with OTP failed: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ ورود ناموفق. ممکن است کد منقضی شده یا اشتباه باشد.\nبا /start درخواست کد جدید دهید.',
      );
      await this.userService.updateState(chatId, UserState.IDLE);
    }
  }

  private async handleWallet(msg: TelegramBot.Message) {
    await this.handleWalletCmd(msg.chat.id);
  }

  private async handleWalletCmd(chatId: number) {
    const user = await this.userService.findByChatId(chatId);

    if (!user || user.state !== UserState.AUTHENTICATED) {
      await this.sendMessage(
        chatId,
        '🔒 ابتدا باید وارد شوید.\nبا /start وارد شوید.',
      );
      return;
    }

    try {
      const wallets = await this.backendApi.getWallets(user.accessToken);
      if (!wallets || wallets.length === 0) {
        await this.sendMessage(
          chatId,
          '💼 شما هنوز کیف پولی ندارید.',
          this.mainMenuReply(),
        );
        return;
      }

      let message = '💼 *کیف پول‌های شما*\n\n';
      for (const w of wallets) {
        const name = w.symbol?.name || 'نامشخص';
        message += `*${name}*\n`;
        message += `🟢 موجودی آزاد: ${Number(w.freeBalance).toLocaleString()}\n`;
        message += `🔒 مسدود شده: ${Number(w.lockedBalance).toLocaleString()}\n`;
        message += `💠 مجموع: ${Number(w.totalBalance).toLocaleString()}\n`;
        message += `✅ قابل برداشت: ${Number(w.availableBalance).toLocaleString()}\n`;
        message += `📌 وضعیت: ${w.status == 'ACTIVE' ? 'فعال ✅' : 'غیر فعال ❌'}\n\n`;
      }

      await this.sendMessage(chatId, message, {
        ...this.mainMenuReply(),
        parse_mode: 'Markdown',
      });
    } catch (err) {
      this.logger.error(`Get wallets failed: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ دریافت اطلاعات کیف پول با خطا مواجه شد. لطفاً بعداً تلاش کنید.',
        this.mainMenuReply(),
      );
    }
  }

  private async handleProfile(msg: TelegramBot.Message) {
    await this.handleProfileCmd(msg.chat.id);
  }

  private async handleProfileCmd(chatId: number) {
    const user = await this.userService.findByChatId(chatId);

    if (!user || user.state !== UserState.AUTHENTICATED) {
      await this.sendMessage(
        chatId,
        '🔒 ابتدا باید وارد شوید.\nبا /start وارد شوید.',
      );
      return;
    }

    try {
      const profile = await this.backendApi.getProfile(user.accessToken);
      const message =
        '👤 *پروفایل شما*\n\n' +
        `🆔 نام: ${profile.firstName || '-'} ${profile.lastName || '-'}\n` +
        `📧 ایمیل: ${profile.email || '-'}\n` +
        `📞 شماره تماس: ${profile.phoneNumber || '-'}\n` +
        `📅 تاریخ عضویت: ${profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('fa-IR') : '-'}`;

      await this.sendMessage(chatId, message, {
        ...this.mainMenuReply(),
        parse_mode: 'Markdown',
      });
    } catch (err) {
      this.logger.error(`Get profile failed: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ دریافت اطلاعات پروفایل با خطا مواجه شد. لطفاً بعداً تلاش کنید.',
        this.mainMenuReply(),
      );
    }
  }

  private async handleHelp(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    await this.handleHelpCmd(chatId);
  }

  private async handleHelpCmd(chatId: number) {
    const user = await this.userService.findByChatId(chatId);
    const isAuth = user?.state === UserState.AUTHENTICATED;

    let message = '🤖 *راهنمای ربات پارس زرگر*\n\n';
    if (!isAuth) {
      message += 'برای استفاده از ربات:\n';
      message += '1️⃣ /start را بزنید\n';
      message += '2️⃣ شماره تماس خود را به اشتراک بگذارید\n';
      message += '3️⃣ کد تایید را وارد کنید\n';
    } else {
      message += 'دکمه‌های منو:\n';
      message += '💼 کیف پول - مشاهده موجودی‌ها\n';
      message += '👤 پروفایل - اطلاعات حساب\n';
      message += '📊 خرید/فروش سفارشی - ثبت سفارش خرید/فروش\n';
      message += '❓ راهنما - این پیام';
    }

    await this.sendMessage(chatId, message, {
      ...this.mainMenuReply(),
      parse_mode: 'Markdown',
    });
  }

  // ── Quote Request Flow ──────────────────────────────────────

  private async handleQuoteRequest(chatId: number) {
    const user = await this.userService.findByChatId(chatId);
    if (!user) return;

    try {
      const pairs = await this.backendApi.getPricePairs(user.accessToken);
      if (!pairs || pairs.length === 0) {
        await this.sendMessage(
          chatId,
          '❌ هیچ جفت‌ارزی برای معامله یافت نشد.',
          this.mainMenuReply(),
        );
        return;
      }

      await this.userService.updateMetadata(chatId, { pairs });
      await this.userService.updateState(
        chatId,
        UserState.WAITING_FOR_QUOTE_PAIR,
      );

      const buttons = pairs.map((p) => {
        const label = `${p.baseSymbol?.name || p.baseSymbol?.slug || '?'} / ${p.quoteSymbol?.name || p.quoteSymbol?.slug || '?'}`;
        return [{ text: label }];
      });
      buttons.push([{ text: '❌ لغو' }]);

      await this.sendMessage(
        chatId,
        '🌐 *انتخاب جفت‌ارز*\n\nلطفاً جفت‌ارز مورد نظر برای سفارش را انتخاب کنید:',
        {
          reply_markup: {
            keyboard: buttons,
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
    } catch (err) {
      this.logger.error(`Failed to fetch pairs: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ خطا در دریافت لیست جفت‌ارزها.',
        this.mainMenuReply(),
      );
    }
  }

  private async handleQuoteInput(msg: TelegramBot.Message, user: any) {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (text === '❌ لغو') {
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
      await this.sendMessage(chatId, '❌ عملیات لغو شد.', this.mainMenuReply());
      return;
    }

    const data = user.metadata || {};

    switch (user.state) {
      case UserState.WAITING_FOR_QUOTE_PAIR: {
        const pairs: any[] = data.pairs || [];
        const selected = pairs.find(
          (p) =>
            `${p.baseSymbol?.name || p.baseSymbol?.slug || '?'} / ${p.quoteSymbol?.name || p.quoteSymbol?.slug || '?'}` ===
            text,
        );
        if (!selected) {
          await this.sendMessage(
            chatId,
            '❌ لطفاً یک جفت‌ارز از لیست انتخاب کنید.',
          );
          return;
        }
        data.pricePairId = selected.id;
        data.pairLabel = `${selected.baseSymbol?.slug || '?'}/${selected.quoteSymbol?.slug || '?'}`;
        delete data.pairs;
        await this.userService.updateMetadata(chatId, data);
        await this.userService.updateState(
          chatId,
          UserState.WAITING_FOR_QUOTE_SIDE,
        );
        await this.sendMessage(
          chatId,
          `📊 جفت‌ارز ${data.pairLabel} انتخاب شد.\n\nنوع معامله را انتخاب کنید:`,
          {
            reply_markup: {
              keyboard: [
                [{ text: 'خرید' }, { text: 'فروش' }],
                [{ text: '❌ لغو' }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
        break;
      }
      case UserState.WAITING_FOR_QUOTE_SIDE:
        if (text !== 'خرید' && text !== 'فروش') {
          await this.sendMessage(
            chatId,
            '❌ لطفاً یکی از گزینه‌های خرید یا فروش را انتخاب کنید.',
          );
          return;
        }
        data.side = text === 'خرید' ? 'BUY' : 'SELL';
        await this.userService.updateMetadata(chatId, data);
        await this.userService.updateState(
          chatId,
          UserState.WAITING_FOR_QUOTE_AMOUNT,
        );
        await this.sendMessage(
          chatId,
          '📊 مقدار مورد نظر را به *گرم* وارد کنید:',
        );
        break;

      case UserState.WAITING_FOR_QUOTE_AMOUNT: {
        const amount = parseFloat(text.replace(',', ''));
        if (isNaN(amount) || amount <= 0) {
          await this.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
          return;
        }
        data.quantity = amount;
        await this.userService.updateMetadata(chatId, data);
        await this.userService.updateState(
          chatId,
          UserState.WAITING_FOR_QUOTE_PRICE,
        );
        await this.sendMessage(
          chatId,
          '📊 قیمت هر گرم را به *تومان* وارد کنید\n(برای قیمت بازار، 0 را وارد کنید):',
        );
        break;
      }

      case UserState.WAITING_FOR_QUOTE_PRICE: {
        const price = parseFloat(text.replace(',', ''));
        if (isNaN(price) || price < 0) {
          await this.sendMessage(chatId, '❌ لطفاً یک عدد معتبر وارد کنید.');
          return;
        }
        data.price = price > 0 ? price : undefined;
        await this.userService.updateMetadata(chatId, data);
        await this.userService.updateState(
          chatId,
          UserState.WAITING_FOR_QUOTE_DESC,
        );
        await this.sendMessage(
          chatId,
          '📝 توضیحات سفارش خود را وارد کنید\n(یا برای رد شدن از این مرحله، خط تیره - را بفرستید):',
        );
        break;
      }

      case UserState.WAITING_FOR_QUOTE_DESC: {
        data.description = text === '-' ? undefined : text;
        await this.userService.updateMetadata(chatId, data);
        await this.userService.updateState(
          chatId,
          UserState.WAITING_FOR_QUOTE_CONFIRM,
        );

        const sideLabel = data.side === 'BUY' ? 'خرید' : 'فروش';
        const priceLabel = data.price
          ? `${data.price.toLocaleString()} تومان`
          : '💰 قیمت بازار';
        const descLabel = data.description ? `\n📝 ${data.description}` : '';
        await this.sendMessage(
          chatId,
          `📋 *تأیید سفارش*\n\n` +
            `📊 جفت‌ارز: ${data.pairLabel || '—'}\n` +
            `🔄 نوع: ${sideLabel}\n` +
            `⚖️ مقدار: ${Number(data.quantity).toLocaleString()} گرم\n` +
            `💰 قیمت: ${priceLabel}${descLabel}\n\n` +
            `آیا تأیید می‌کنید؟`,
          {
            reply_markup: {
              keyboard: [[{ text: '✅ تأیید' }, { text: '❌ لغو' }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
        break;
      }

      case UserState.WAITING_FOR_QUOTE_CONFIRM:
        if (text === '✅ تأیید') {
          await this.submitQuoteRequest(chatId, user);
        } else {
          await this.userService.updateState(chatId, UserState.AUTHENTICATED);
          await this.sendMessage(
            chatId,
            '❌ عملیات لغو شد.',
            this.mainMenuReply(),
          );
        }
        break;
    }
  }

  private async submitQuoteRequest(chatId: number, user: any) {
    const data = user.metadata || {};
    if (!data.side || !data.quantity || !data.pricePairId) {
      await this.sendMessage(
        chatId,
        '❌ اطلاعات ناقص است. لطفاً دوباره تلاش کنید.',
        this.mainMenuReply(),
      );
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
      return;
    }

    try {
      // Check wallet balance first
      const wallets = await this.backendApi.getWallets(user.accessToken);

      // Find the pair to know which symbol to check
      const pairs = await this.backendApi.getPricePairs(user.accessToken);
      const pair = pairs.find((p) => p.id === data.pricePairId);
      if (!pair) {
        await this.sendMessage(
          chatId,
          '❌ جفت‌ارز انتخاب شده یافت نشد.',
          this.mainMenuReply(),
        );
        await this.userService.updateState(chatId, UserState.AUTHENTICATED);
        return;
      }

      if (data.side === 'BUY') {
        const quoteId = pair.quoteSymbol?.id;
        const quoteWallet = wallets.find((w) => w.symbol?.id === quoteId);
        const required = (data.price || 0) * data.quantity;
        const available = Number(quoteWallet?.freeBalance || 0);
        if (available < required) {
          await this.sendMessage(
            chatId,
            `❌ *موجودی ناکافی*\n\n` +
              `برای خرید ${Number(data.quantity).toLocaleString()} گرم، حداقل ${required.toLocaleString()} تومان نیاز دارید.\n` +
              `موجودی فعلی: ${available.toLocaleString()} تومان\n\n` +
              `لطفاً ابتدا موجودی خود را افزایش دهید. 💰`,
            this.mainMenuReply(),
          );
          await this.userService.updateState(chatId, UserState.AUTHENTICATED);
          return;
        }
      } else {
        const baseId = pair.baseSymbol?.id;
        const baseWallet = wallets.find((w) => w.symbol?.id === baseId);
        const available = Number(baseWallet?.freeBalance || 0);
        if (available < data.quantity) {
          await this.sendMessage(
            chatId,
            `❌ *موجودی ناکافی*\n\n` +
              `برای فروش ${Number(data.quantity).toLocaleString()} گرم، حداقل ${Number(data.quantity).toLocaleString()} گرم ${pair.baseSymbol?.slug || 'XAU'} نیاز دارید.\n` +
              `موجودی فعلی: ${Number(available).toLocaleString()} گرم\n\n` +
              `لطفاً ابتدا موجودی خود را افزایش دهید. 💰`,
            this.mainMenuReply(),
          );
          await this.userService.updateState(chatId, UserState.AUTHENTICATED);
          return;
        }
      }

      const result = await this.backendApi.createQuoteRequest(
        user.accessToken,
        {
          side: data.side,
          pricePairId: data.pricePairId,
          quantity: data.quantity,
          price: data.price,
          notes: data.description,
        },
      );

      await this.userService.updateState(chatId, UserState.AUTHENTICATED);

      const orderId = result.request?.id || '';
      const sideLabel = data.side === 'BUY' ? 'خرید' : 'فروش';
      const oppositeSide = data.side === 'BUY' ? 'SELL' : 'BUY';
      const oppositeLabel = data.side === 'BUY' ? 'فروش' : 'خرید';
      const priceLabel = data.price
        ? `${data.price.toLocaleString()} تومان`
        : '💰 قیمت بازار';
      const totalPrice = data.price
        ? `${(data.price * data.quantity).toLocaleString()} تومان`
        : '—';
      const descText = data.description ? `\n📝 ${data.description}` : '';
      const channelMsg =
        `📄 *سفارش ${sideLabel}*\n` +
        `🆔 کد: ${orderId.slice(0, 8)}...\n` +
        `📊 جفت‌ارز: ${data.pairLabel || '—'}\n` +
        `⚖️ مقدار: ${Number(data.quantity).toLocaleString()} گرم\n` +
        `💰 قیمت واحد: ${priceLabel}\n` +
        `💵 جمع کل: ${totalPrice}\n` +
        `📌 وضعیت: در انتظار${descText}`;

      // Track order locally for matching
      if (orderId) {
        this.activeOrders.set(orderId, {
          orderId,
          chatId,
          userId: user.id,
          side: data.side,
          price: data.price || null,
          quantity: data.quantity,
          pairLabel: data.pairLabel || '—',
          pricePairId: data.pricePairId,
          pairQuoteSymbolId: pair.quoteSymbol?.id,
          status: 'PENDING',
        });
      }

      // Check for local match against opposite-side orders
      let matchedOrderId: string | undefined;
      for (const [id, o] of this.activeOrders) {
        if (
          o.status === 'PENDING' &&
          o.side === oppositeSide &&
          o.quantity === data.quantity &&
          o.pairLabel === data.pairLabel &&
          o.chatId !== chatId
        ) {
          matchedOrderId = id;
          break;
        }
      }

      // Publish to channel with inline match button
      const inlineMatchBtn: TelegramBot.InlineKeyboardButton[][] = [];
      if (orderId) {
        inlineMatchBtn.push([
          { text: '✅ تطبیق سفارش', callback_data: `accept:${orderId}` },
        ]);
      }
      const sent = await this.sendToChannel(channelMsg, {
        reply_markup:
          inlineMatchBtn.length > 0
            ? { inline_keyboard: inlineMatchBtn }
            : undefined,
      });
      if (sent && orderId) {
        this.channelMessages.set(orderId, {
          chatId: sent.chat.id,
          messageId: sent.message_id,
        });
      }

      // Notify the BUYER about the matching order
      // Always send to the BUYER with the SELL order ID in the callback.
      if (matchedOrderId) {
        const matched = this.activeOrders.get(matchedOrderId);
        if (matched) {
          // If current user is BUYER → notify them (chatId) with the found SELL order (matchedOrderId)
          // If current user is SELLER → notify the matched BUYER (matched.chatId) with current SELL order (orderId)
          const notifyChatId = data.side === 'BUY' ? chatId : matched.chatId;
          const acceptOrderId = data.side === 'BUY' ? matchedOrderId : orderId;

          await this.sendMessage(
            notifyChatId,
            `🔔 *فرصت تطبیق سفارش ${oppositeLabel}*\n\n` +
              `یک سفارش ${oppositeLabel} هماهنگ با درخواست ${sideLabel} شما ثبت شده است:\n` +
              `⚖️ مقدار: ${Number(data.quantity).toLocaleString()} گرم\n` +
              `💰 قیمت: ${priceLabel}\n\n` +
              `برای تأیید و تکمیل معامله از دکمه زیر استفاده کنید:`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '✅ قبول تطبیق',
                      callback_data: `accept:${acceptOrderId}`,
                    },
                  ],
                ],
              },
            },
          );
        }
      }

      if (matchedOrderId) {
        // Bot already sent DM with accept button to the BUYER above
        // Show a different message for the SELLER (no action needed from them)
        if (data.side === 'SELL') {
          await this.sendMessage(
            chatId,
            `📋 *سفارش شما در کانال منتشر شد*\n\n` +
              `🔍 خریدار مطلع شد و در صورت تأیید، معامله انجام می‌شود.\n` +
              `پس از تکمیل، به شما اطلاع داده می‌شود. ✅`,
            this.mainMenuReply(),
          );
        }
      } else if (result.matchAlert) {
        await this.sendMessage(
          chatId,
          `🔔 *فرصت تطبیق*\n\n` +
            `یک سفارش هماهنگ با درخواست شما در صف انتظار وجود دارد.\n` +
            `منتظر تأیید طرف مقابل باشید.`,
          this.mainMenuReply(),
        );
      } else {
        await this.sendMessage(
          chatId,
          `📋 *سفارش شما در کانال منتشر شد*\n\n` +
            `🔍 منتظر بمانید تا فرد دیگری سفارش شما را تطبیق دهد.\n` +
            `پس از تطبیق، به شما اطلاع داده می‌شود. ✅`,
          this.mainMenuReply(),
        );
      }
    } catch (err) {
      this.logger.error(`Quote request failed: ${err.message}`);
      await this.sendMessage(
        chatId,
        `❌ خطا در ثبت سفارش: ${err.message}`,
        this.mainMenuReply(),
      );
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
    }
  }

  // ── My Orders ─────────────────────────────────────────────

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery) {
    const chatId = query.message?.chat.id;
    const data = query.data;
    if (!chatId || !data) return;

    // Answer callback to remove the loading indicator
    await this.bot.answerCallbackQuery(query.id);

    if (data.startsWith('cancel:')) {
      const orderId = data.slice(7);
      const user = await this.userService.findByChatId(chatId);
      if (!user || user.state !== UserState.AUTHENTICATED) {
        await this.sendMessage(
          chatId,
          '🔒 ابتدا باید وارد شوید.',
          this.mainMenuReply(),
        );
        return;
      }

      await this.userService.updateMetadata(chatId, { cancelOrderId: orderId });
      await this.userService.updateState(
        chatId,
        UserState.WAITING_FOR_ORDER_CANCEL,
      );

      await this.sendMessage(
        chatId,
        '⚠️ *آیا از لغو این سفارش اطمینان دارید؟*\n\n' +
          'در صورت لغو، موجودی مسدود شده به کیف پول شما بازگردانده می‌شود.',
        {
          reply_markup: {
            keyboard: [[{ text: '✅ بله، لغو کن' }], [{ text: '❌ لغو' }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        },
      );
    }

    if (data.startsWith('accept:')) {
      const orderId = data.slice(7);
      const user = await this.userService.findByChatId(chatId);
      if (!user || user.state !== UserState.AUTHENTICATED) {
        await this.sendMessage(chatId, '🔒 ابتدا باید وارد شوید.', this.mainMenuReply());
        return;
      }

      const sellOrder = this.activeOrders.get(orderId);

      // Prevent seller from matching their own order
      if (sellOrder && sellOrder.chatId === chatId) {
        await this.sendMessage(chatId,
          '⚠️ شما نمی‌توانید سفارش خود را تطبیق دهید.\n\nمنتظر بمانید تا فرد دیگری سفارش شما را تطبیق کند.',
          this.mainMenuReply());
        return;
      }

      try {
        // ── Balance check & prepare ──
        let required = 0;
        if (sellOrder && sellOrder.price && sellOrder.price > 0 && sellOrder.pairQuoteSymbolId) {
          const wallets = await this.backendApi.getWallets(user.accessToken);
          const quoteWallet = wallets.find(w => w.symbol?.id === sellOrder.pairQuoteSymbolId);
          required = sellOrder.price * sellOrder.quantity;
          const available = Number(quoteWallet?.freeBalance || 0);
          if (available < required) {
            await this.sendMessage(chatId,
              `❌ *موجودی ناکافی*\n\n` +
              `برای تطبیق این سفارش حداقل ${required.toLocaleString()} تومان نیاز دارید.\n` +
              `موجودی فعلی: ${available.toLocaleString()} تومان\n\n` +
              `لطفاً ابتدا موجودی خود را افزایش دهید. 💰`,
              this.mainMenuReply());
            return;
          }

          // Balance sufficient — proceed with match.
          // The backend's match() handles wallet transfer, commission, and
          // transaction recording — no separate BUY order needed.
        }

        // Call backend to execute the match (transfers XAU minus commission to buyer,
        // IRR minus commission to seller, records transactions & system profit)
        const matchResult = await this.backendApi.acceptMatch(user.accessToken, orderId);

        // Update local state
        if (sellOrder) {
          sellOrder.status = 'MATCHED';
          this.activeOrders.set(orderId, sellOrder);
        }

        // Notify seller via DM (buyer also gets notified by the backend's Telegram bot)
        if (sellOrder) {
          await this.sendMessage(sellOrder.chatId,
            `✅ *سفارش فروش شما تکمیل شد*\n\n` +
            `خریدار سفارش شما را تطبیق داد.\n` +
            `💰 موجودی کیف پول شما به‌روزرسانی شد.\n\n` +
            `از منوی زیر استفاده کنید:`,
            this.mainMenuReply());
        }

        // Update both orders' channel messages with matched status (keep info, remove button)
        const orderIdsToUpdate = [orderId, matchResult?.matchedBuyOrderId].filter(Boolean) as string[];
        for (const oid of orderIdsToUpdate) {
          const stored = this.channelMessages.get(oid);
          const info = this.activeOrders.get(oid);
          if (stored) {
            try {
              const sideLabel = info?.side === 'BUY' ? 'خرید' : 'فروش';
              const priceLabel = info?.price
                ? `${info.price.toLocaleString()} تومان`
                : '💰 قیمت بازار';
              const totalPrice = info?.price && info?.quantity
                ? `${(info.price * info.quantity).toLocaleString()} تومان`
                : '—';
              const msg =
                `📄 *سفارش ${sideLabel}*\n` +
                `🆔 کد: ${oid.slice(0, 8)}...\n` +
                `📊 جفت‌ارز: ${info?.pairLabel || '—'}\n` +
                `⚖️ مقدار: ${Number(info?.quantity || 0).toLocaleString()} گرم\n` +
                `💰 قیمت واحد: ${priceLabel}\n` +
                `💵 جمع کل: ${totalPrice}\n` +
                `📌 وضعیت: ✅ تکمیل شده`;
              await this.bot.editMessageText(msg, {
                chat_id: stored.chatId,
                message_id: stored.messageId,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [] },
              });
              this.logger.log(`Channel message ${stored.messageId} updated for matched order ${oid}`);
            } catch {
              this.logger.warn(`Could not edit channel message ${stored.messageId} for order ${oid}`);
            }
          }
        }

        await this.sendMessage(chatId,
          '✅ *درخواست تطبیق شما ثبت شد*\n\n' +
          'فروشنده مطلع خواهد شد.\n' +
          'پس از تکمیل، موجودی کیف پول شما به‌روزرسانی می‌شود.',
          this.mainMenuReply());
      } catch (err) {
        this.logger.error(`Accept match failed for order ${orderId}: ${err.message}`);
        const reason = err?.response?.data?.message || err.message || 'خطا در تطبیق';
        await this.sendMessage(chatId, `❌ *تطبیق ناموفق*\n\n${reason}`, this.mainMenuReply());
      }
    }
  }

  private async handleMyOrders(chatId: number) {
    const user = await this.userService.findByChatId(chatId);
    if (!user || user.state !== UserState.AUTHENTICATED) {
      await this.sendMessage(
        chatId,
        '🔒 ابتدا باید وارد شوید.',
        this.mainMenuReply(),
      );
      return;
    }

    try {
      const orders = await this.backendApi.getMyQuoteRequests(user.accessToken);
      if (!orders || orders.length === 0) {
        await this.sendMessage(
          chatId,
          '📭 شما هیچ سفارشی ثبت نکرده‌اید.',
          this.mainMenuReply(),
        );
        return;
      }

      for (const order of orders) {
        const sideLabel = order.side === 'BUY' ? 'خرید' : 'فروش';
        const symbol = order.pricePair?.baseSymbol?.slug || '?';
        const priceLabel = order.price
          ? `${Number(order.price).toLocaleString()} تومان`
          : '💰 قیمت بازار';
        const statusEmoji =
          order.status === 'PENDING'
            ? '🟡'
            : order.status === 'MATCHED'
              ? '🟢'
              : '🔴';
        const statusText =
          order.status === 'PENDING'
            ? 'در انتظار'
            : order.status === 'MATCHED'
              ? 'تطبیق یافته'
              : 'لغو شده';

        let msg =
          `📄 *سفارش ${sideLabel} ${symbol}*\n` +
          `🆔 کد: ${order.id.slice(0, 8)}...\n` +
          `⚖️ مقدار: ${Number(order.quantity).toLocaleString()} گرم\n` +
          `💰 قیمت: ${priceLabel}\n` +
          `${statusEmoji} وضعیت: ${statusText}\n` +
          `📅 تاریخ: ${new Date(order.createAt).toLocaleDateString('fa-IR')}\n`;

        const inlineKeyboard: TelegramBot.InlineKeyboardButton[][] = [];
        if (order.status === 'PENDING') {
          inlineKeyboard.push([
            { text: '❌ لغو سفارش', callback_data: `cancel:${order.id}` },
          ]);
        }
        msg += `──────────────`;

        await this.sendMessage(chatId, msg, {
          parse_mode: 'Markdown',
          reply_markup:
            inlineKeyboard.length > 0
              ? { inline_keyboard: inlineKeyboard }
              : undefined,
        });
      }

      await this.sendMessage(
        chatId,
        'از منوی زیر استفاده کنید:',
        this.mainMenuReply(),
      );
    } catch (err) {
      this.logger.error(`Failed to fetch orders: ${err.message}`);
      await this.sendMessage(
        chatId,
        '❌ خطا در دریافت سفارشات.',
        this.mainMenuReply(),
      );
    }
  }

  private async handleOrderCancelInput(
    chatId: number,
    user: any,
    text: string,
  ) {
    if (text === '❌ لغو') {
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
      await this.sendMessage(chatId, '❌ عملیات لغو شد.', this.mainMenuReply());
      return;
    }

    const orderId = user.metadata?.cancelOrderId;
    if (!orderId) {
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
      await this.sendMessage(
        chatId,
        '❌ خطا: سفارش یافت نشد.',
        this.mainMenuReply(),
      );
      return;
    }

    if (text !== '✅ بله، لغو کن') {
      await this.sendMessage(
        chatId,
        '❌ ورودی نامعتبر. لطفاً از دکمه‌ها استفاده کنید.',
      );
      return;
    }

    try {
      await this.backendApi.cancelQuoteRequest(user.accessToken, orderId);
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);

      // Clean up local tracking
      this.activeOrders.delete(orderId);

      // Update channel message to show canceled (keep info, remove button)
      const stored = this.channelMessages.get(orderId);
      const info = this.activeOrders.get(orderId);
      if (stored) {
        try {
          const sideLabel = info?.side === 'BUY' ? 'خرید' : 'فروش';
          const priceLabel = info?.price
            ? `${info.price.toLocaleString()} تومان`
            : '💰 قیمت بازار';
          const totalPrice = info?.price && info?.quantity
            ? `${(info.price * info.quantity).toLocaleString()} تومان`
            : '—';
          const msg =
            `📄 *سفارش ${sideLabel}*\n` +
            `🆔 کد: ${orderId.slice(0, 8)}...\n` +
            `📊 جفت‌ارز: ${info?.pairLabel || '—'}\n` +
            `⚖️ مقدار: ${Number(info?.quantity || 0).toLocaleString()} گرم\n` +
            `💰 قیمت واحد: ${priceLabel}\n` +
            `💵 جمع کل: ${totalPrice}\n` +
            `📌 وضعیت: ❌ لغو شده`;
          await this.bot.editMessageText(msg, {
            chat_id: stored.chatId,
            message_id: stored.messageId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] },
          });
          this.logger.log(`Channel message ${stored.messageId} updated for canceled order ${orderId}`);
        } catch (editErr) {
          this.logger.warn(`Could not edit channel message ${stored.messageId}: ${editErr.message}`);
        }
      }

      await this.sendMessage(
        chatId,
        '✅ *سفارش با موفقیت لغو شد*\n\n' +
          'موجودی شما به کیف پول برگردانده شد.',
        this.mainMenuReply(),
      );
    } catch (err) {
      this.logger.error(`Cancel order failed: ${err.message}`);
      await this.sendMessage(
        chatId,
        `❌ خطا در لغو سفارش: ${err.message}`,
        this.mainMenuReply(),
      );
      await this.userService.updateState(chatId, UserState.AUTHENTICATED);
    }
  }

  private async ensureChannelMembership(
    chatId: number,
    userId: number,
    channelChatId: number,
  ) {
    try {
      const member = await this.bot.getChatMember(channelChatId, userId);
      const status = member.status;

      if (status === 'left' || status === 'kicked') {
        this.logger.log(
          `User ${userId} is not a channel member (${status}), sending invite link`,
        );

        const staticLink = this.configService.get('channel', {
          infer: true,
        }).inviteLink;
        let link: string;

        if (staticLink) {
          link = staticLink;
        } else {
          try {
            const inviteLink = await this.bot.createChatInviteLink(
              channelChatId,
              {
                member_limit: 1,
              },
            );
            link = inviteLink.invite_link;
          } catch (linkErr) {
            this.logger.error(
              `Failed to create invite link: ${linkErr.message}`,
            );
            await this.sendMessage(
              chatId,
              '📢 لطفاً برای اطلاع از آخرین اخبار به کانال رسمی ما بپیوندید.',
            );
            return;
          }
        }

        await this.sendMessage(
          chatId,
          '📢 *به کانال ما بپیوندید*\n\nبرای اطلاع از آخرین اخبار و قیمت‌ها، لطفاً با استفاده از لینک زیر به کانال رسمی ما بپیوندید:\n\n' +
            `${link}\n\n` +
            '_این لینک فقط یک بار قابل استفاده است._',
          { parse_mode: 'Markdown' },
        );
      }
    } catch (err) {
      this.logger.error(`Failed to check channel membership: ${err.message}`);
    }
  }

  /**
   * Periodically checks for orders that changed to MATCHED status and notifies
   * the seller that their order is completed and wallet updated.
   */
  private startOrderMonitor(): void {
    setInterval(async () => {
      try {
        const allUsers = await this.userService.findAllAuthenticated();
        for (const user of allUsers) {
          if (user.state !== UserState.AUTHENTICATED || !user.accessToken) continue;
          try {
            const orders = await this.backendApi.getMyQuoteRequests(
              user.accessToken,
            );
            for (const order of orders) {
              if (order.status === 'MATCHED') {
                const tracked = this.activeOrders.get(order.id);
                if (tracked && tracked.status !== 'MATCHED') {
                  tracked.status = 'MATCHED';
                  this.activeOrders.set(order.id, tracked);

                  await this.sendMessage(
                    user.telegramChatId,
                    `✅ *سفارش ${order.side === 'SELL' ? 'فروش' : 'خرید'} شما تکمیل شد*\n\n` +
                      `🆔 کد: ${order.id.slice(0, 8)}...\n` +
                      `معامله با موفقیت انجام شد.\n` +
                      `💰 موجودی کیف پول شما به‌روزرسانی شد.\n`,
                    this.mainMenuReply(),
                  );

                }
              }
            }
          } catch {
            // user token might be expired, skip
          }
        }
      } catch (err) {
        this.logger.error(`Order monitor error: ${err.message}`);
      }
    }, 30000);
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
  ) {
    try {
      await this.bot.sendMessage(chatId, text, { ...options });
    } catch (err) {
      this.logger.error(`Failed to send message to ${chatId}: ${err.message}`);
    }
  }

  async sendToChannel(
    message: string,
    options?: TelegramBot.SendMessageOptions,
  ): Promise<TelegramBot.Message | undefined> {
    const channelId = this.configService.get('channel', {
      infer: true,
    }).targetId;
    if (!channelId) {
      this.logger.error('TELEGRAM_TARGET_CHANNEL_ID is not set');
      return;
    }
    try {
      const sent = await this.bot.sendMessage(channelId, message, {
        parse_mode: 'Markdown',
        protect_content: true,
        ...options,
      });
      this.logger.log(`Message ${sent.message_id} sent to channel ${channelId}`);
      return sent;
    } catch (err) {
      this.logger.error(
        `Failed to send to channel ${channelId}: ${err.message}`,
      );
    }
  }
}
