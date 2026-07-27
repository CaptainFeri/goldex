import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Api, TelegramClient } from 'telegram';
import { StringSession, StoreSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import {
  CallbackQuery,
  CallbackQueryEvent,
} from 'telegram/events/CallbackQuery';
import type { Dialog } from 'telegram/tl/custom/dialog';
import { TELEGRAM_OPTIONS } from './telegram.constants';
import type { TelegramOptions } from './interfaces';
import { StructuredLogger } from '../logger/structured-logger';
import { CustomFile } from 'telegram/client/uploads';
import { PriceHistoryService } from './price/price-history.service';
import { ChartImageService } from './price/chart-image.service';
import { parsePriceMessage } from './price/price-message.parser';
import { formatArbitrageMessage } from './price/price-message.formatter';
import type { ArbitrageOpportunity, OrderButton } from './price/price.types';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(TelegramService.name);
  private client: TelegramClient;
  private monitoredPeerIds: (string | number)[] = [];
  private targetPeerId: string | null = null;

  private authCodeResolver: ((code: string) => void) | null = null;
  private authPasswordResolver: ((password: string) => void) | null = null;

  constructor(
    @Inject(TELEGRAM_OPTIONS)
    private readonly options: TelegramOptions,
    private readonly eventEmitter: EventEmitter2,
    private readonly priceHistory: PriceHistoryService,
    private readonly chartImage: ChartImageService,
  ) {}

  async onModuleInit(): Promise<void> {
    const session = this.createSession();

    this.client = new TelegramClient(
      session,
      this.options.apiId,
      this.options.apiHash,
      {
        connectionRetries: 5,
      },
    );

    await this.client.connect();

    const isAuthorized = await this.client.isUserAuthorized();

    if (isAuthorized) {
      this.logger.log('User already authorized');
      await this.finalizeInitialization();
      return;
    }

    this.logger.log(
      'Authentication required. Waiting for code via POST /api/auth/code...',
    );
    this.startDeferredAuth();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async finalizeInitialization(): Promise<void> {
    this.logger.log('Telegram client initialized');
    await this.resolveMonitoredChannels();
    await this.resolveTargetChannel();
    this.registerEventHandlers();
    // await this.fetchRecentHistory();
  }

  private startDeferredAuth(): void {
    this.client
      .start({
        phoneNumber: () => Promise.resolve(this.options.phoneNumber),
        password: () =>
          new Promise<string>((resolve) => {
            if (this.options.password) {
              resolve(this.options.password);
            } else {
              this.authPasswordResolver = resolve;
            }
          }),
        phoneCode: () =>
          new Promise<string>((resolve) => {
            this.authCodeResolver = resolve;
          }),
        onError: (err) => {
          this.logger.error('Auth error', err);
          if ((err as any)?.code) this.logger.error(`Error code: ${(err as any).code}`);
          if ((err as any)?.errorMessage) this.logger.error(`Error message: ${(err as any).errorMessage}`);
        },
      })
      .then(async () => {
        const savedSession = this.client.session.save() as unknown as string;
        this.logger.warn(`Session string: ${savedSession}`);
        await this.finalizeInitialization();
      })
      .catch((err) => {
        this.logger.error('Auth failed', err);
        if ((err as any)?.code) this.logger.error(`Error code: ${(err as any).code}`);
        if ((err as any)?.errorMessage) this.logger.error(`Error message: ${(err as any).errorMessage}`);
      });
  }

  async resendCode(): Promise<{ sentViaApp: boolean; phoneCodeHash: string } | null> {
    try {
      const result = await this.client.sendCode(
        { apiId: this.options.apiId, apiHash: this.options.apiHash },
        this.options.phoneNumber,
      );
      this.logger.log(`Verification code resent (via app: ${result.isCodeViaApp})`);
      return {
        sentViaApp: result.isCodeViaApp,
        phoneCodeHash: result.phoneCodeHash,
      };
    } catch (err) {
      this.logger.error('Failed to resend code', err);
      if ((err as any)?.code) this.logger.error(`Error code: ${(err as any).code}`);
      if ((err as any)?.errorMessage) this.logger.error(`Error message: ${(err as any).errorMessage}`);
      return null;
    }
  }

  private createSession() {
    if (this.options.sessionString) {
      return new StringSession(this.options.sessionString);
    }

    return new StoreSession(this.options.sessionFolder ?? 'sessions');
  }

  private async resolveMonitoredChannels(): Promise<void> {
    const channels = this.options.monitoredChannels;
    if (!channels || channels.length === 0) {
      this.logger.warn('No monitored channels configured');
      return;
    }

    for (const target of channels) {
      const identifier = target.id || target.username;
      if (!identifier) continue;

      const candidates = /^-?\d+$/.test(identifier)
        ? [identifier, `-100${identifier.replace(/^-100/, '')}`]
        : [identifier];

      let resolved = false;
      for (const id of candidates) {
        try {
          const entity: any = await this.client.getEntity(id);
          this.monitoredPeerIds.push(entity.id.toString());
          this.logger.log(
            `Monitoring: ${entity.title || entity.username || entity.id}`,
          );
          resolved = true;
          break;
        } catch {
          // try next
        }
      }

      if (!resolved) {
        this.monitoredPeerIds.push(identifier);
        this.logger.warn(
          `Could not resolve channel ${identifier}, using raw value`,
        );
      }
    }
  }

  private async resolveTargetChannel(): Promise<void> {
    const target = this.options.targetChannel;
    if (!target) {
      this.logger.log(
        'No target channel configured, messages will not be shared',
      );
      return;
    }

    const candidates = /^-?\d+$/.test(target)
      ? [target, `-100${target.replace(/^-100/, '')}`]
      : [target];

    for (const id of candidates) {
      try {
        const entity: any = await this.client.getEntity(id);
        this.targetPeerId = entity.id.toString();
        this.logger.log(
          `Target channel resolved: ${entity.title || entity.username || this.targetPeerId}`,
        );
        return;
      } catch {
        // try next
      }
    }

    this.logger.error(
      `Could not resolve target channel "${target}". Make sure the account is a member. ` +
        `Use @username or full numeric ID with -100 prefix.`,
    );
  }

  private async fetchRecentHistory(): Promise<void> {
    for (const peerId of this.monitoredPeerIds) {
      try {
        const messages = await this.client.getMessages(peerId, { limit: 50 });
        this.logger.log(
          `Fetched ${messages.length} recent messages from ${peerId}`,
        );

        for (const msg of messages) {
          if (!msg) continue;
          const chat: any = msg.chat;
          const sender: any = msg.sender;
          const chatTitle = chat?.title || chat?.username || peerId.toString();
          const msgData = {
            type: 'HISTORY',
            chatId: peerId.toString(),
            chatTitle,
            senderId: msg.senderId?.toString(),
            senderName: sender?.username || sender?.firstName || 'unknown',
            text: msg.message,
            date: msg.date,
            messageId: msg.id,
            history: true,
          };
          const { type, ...rest } = msgData;
          this.logger.logStructured(type, rest);

          this.eventEmitter.emit('telegram.message', {
            ...msgData,
            raw: msg,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to fetch history for ${peerId}`, error);
      }
    }
  }

  private registerEventHandlers(): void {
    this.client.addEventHandler(
      (event: NewMessageEvent) => this.handleNewMessage(event),
      new NewMessage({ chats: this.monitoredPeerIds }),
    );

    this.client.addEventHandler(
      (event: CallbackQueryEvent) => this.handleCallbackQuery(event),
      new CallbackQuery({}),
    );

    this.logger.log('Message and callback query event handlers registered');
  }

  private async handleNewMessage(event: NewMessageEvent): Promise<void> {
    const message = event.message;

    if (!this.isMonitored(message.chatId?.toString())) return;

    this.logger.logStructured('NEW_MESSAGE', {
      messageId: message.id,
      chatId: message.chatId?.toString(),
      date: message.date,
      text: message.message,
    });

    const chatId = message.chatId?.toString();
    const chat: any = await message.getChat();
    const sender: any = await message.getSender();
    const chatTitle = chat?.title || chat?.username || chatId;
    const senderName = sender?.firstName || sender?.username || 'unknown';

    const msgData = {
      type: 'NEW_MESSAGE',
      chatId,
      chatTitle,
      senderId: sender?.id?.toString(),
      senderName,
      text: message.message,
      date: message.date,
      messageId: message.id,
      history: false,
    };

    this.eventEmitter.emit('telegram.message', {
      ...msgData,
      raw: message,
    });

    await this.processPriceMessage(message);
  }

  /**
   * Parses a price post and records it in the in-memory history. Only when a
   * *new* arbitrage opportunity is detected is a report sent to the target
   * channel — regular price updates are not forwarded.
   */
  private async processPriceMessage(message: Api.Message): Promise<void> {
    const parsed = parsePriceMessage(message.message);
    if (!parsed) return;

    const orderButton = this.firstOrderButton(message.replyMarkup);
    const snapshot = this.priceHistory.record(
      parsed,
      message.id,
      message.date,
      orderButton,
      message.chatId?.toString(),
    );

    this.logger.logStructured('PRICE_PARSED', {
      messageId: message.id,
      category: snapshot.categoryKey,
      side: parsed.sideLabel,
      ourAction: parsed.ourAction,
      price: parsed.price,
      deliveryType: parsed.deliveryType,
      quantity: parsed.quantity,
      description: parsed.description,
    });

    this.eventEmitter.emit('telegram.price', { snapshot });

    const opportunity = this.priceHistory.detectArbitrage(parsed, message.date);
    if (opportunity && this.priceHistory.markReportedIfNew(opportunity)) {
      this.eventEmitter.emit('telegram.arbitrage', opportunity);
      await this.sendArbitrageAlert(
        opportunity,
        parsed.subType,
        parsed.deliveryType,
      );
    }
  }

  /**
   * Sends the arbitrage report with a chart screenshot of the opportunity's
   * bucket. Falls back to a text-only alert if the image can't be rendered
   * (e.g. QuickChart unreachable). The report text carries tap-to-open links
   * to the source orders, since user accounts can't send inline buttons.
   */
  private async sendArbitrageAlert(
    opportunity: ArbitrageOpportunity,
    subType: string,
    deliveryType: string,
  ): Promise<void> {
    const caption = formatArbitrageMessage(opportunity);
    const bucket = this.priceHistory.getBucketHistory(subType, deliveryType);

    try {
      const image = await this.chartImage.render(opportunity, bucket);
      await this.sendPhotoToTarget(image, caption);
      this.logger.log('Sent arbitrage alert with chart image');
    } catch (error) {
      this.logger.warn(
        `Chart image failed, sending text-only alert: ${String(error)}`,
      );
      await this.shareToTarget(caption);
    }
  }

  /** Sends a PNG (with caption) to the target channel. */
  private async sendPhotoToTarget(
    image: Buffer,
    caption: string,
  ): Promise<void> {
    if (!this.targetPeerId) return;
    const entity = await this.client.getInputEntity(this.targetPeerId);
    const file = new CustomFile('chart.png', image.length, 'chart.png', image);
    await this.client.sendFile(entity, { file, caption });
  }

  /** Picks the first inline button (quantity 1) from a source message. */
  private firstOrderButton(
    replyMarkup?: Api.TypeReplyMarkup,
  ): OrderButton | undefined {
    return this.extractButtons(replyMarkup)[0]?.[0];
  }

  /** Flattens an inline keyboard into a simple [row][button] text/url/data list. */
  private extractButtons(
    replyMarkup?: Api.TypeReplyMarkup,
  ): { text: string; url?: string; data?: string }[][] {
    const markup: any = replyMarkup;
    if (!markup?.rows) return [];
    return markup.rows.map((row: any) =>
      (row.buttons ?? []).map((btn: any) => ({
        text: btn.text,
        url: btn.url,
        data:
          btn.data instanceof Buffer
            ? btn.data.toString('utf-8')
            : typeof btn.data === 'string'
              ? btn.data
              : undefined,
      })),
    );
  }

  private async shareToTarget(
    text: string,
    replyMarkup?: Api.TypeReplyMarkup,
  ): Promise<void> {
    if (!this.targetPeerId || !text) return;

    const entity = await this.client.getInputEntity(this.targetPeerId);

    try {
      await this.client.invoke(
        new Api.messages.SendMessage({
          peer: entity,
          message: text,
          replyMarkup,
          noWebpage: true,
        }),
      );
      this.logger.log(`Shared message to target channel`);
    } catch (error) {
      this.logger.error('Failed to share message to target channel', error);
    }
  }

  private async handleCallbackQuery(event: CallbackQueryEvent): Promise<void> {
    const query = event.query;
    const data = event.data;
    const dataStr = data ? Buffer.from(data).toString('utf-8') : '';
    const parts = dataStr.split('|');

    const sender: any = event.sender;
    const chat: any = await event.getChat();

    this.logger.logStructured('CALLBACK_QUERY', {
      queryId: query.queryId?.toString(),
      senderId: sender?.id?.toString(),
      senderName: sender?.firstName || sender?.username || 'unknown',
      chatId: chat?.id?.toString(),
      chatTitle: chat?.title || chat?.username || '',
      data: dataStr,
      parts,
      messageId: event.messageId,
    });

    await event.answer();

    this.eventEmitter.emit('telegram.callbackQuery', {
      queryId: query.queryId?.toString(),
      senderId: sender?.id?.toString(),
      senderName: sender?.firstName || sender?.username || 'unknown',
      chatId: chat?.id?.toString(),
      chatTitle: chat?.title || chat?.username || '',
      data: dataStr,
      parts,
      messageId: event.messageId,
      raw: event,
    });
  }

  private isMonitored(chatId: string | undefined): boolean {
    if (!chatId || this.monitoredPeerIds.length === 0) return true;
    return this.monitoredPeerIds.some(
      (id) =>
        id.toString() === chatId ||
        id.toString() === chatId.replace('-100', ''),
    );
  }

  async joinChannel(channelUsername: string): Promise<boolean> {
    try {
      await this.client.invoke(
        new Api.channels.JoinChannel({
          channel: channelUsername,
        }),
      );
      this.logger.log(`Joined channel: ${channelUsername}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to join channel ${channelUsername}`, error);
      return false;
    }
  }

  async getDialogs(): Promise<{ id: string; title: string; type: string }[]> {
    const dialogs = await this.client.getDialogs({});
    return dialogs.map((dialog: Dialog) => ({
      id: dialog.id?.toString() ?? '',
      title:
        dialog.title || dialog.name || dialog.entity?.className || 'unknown',
      type: dialog.isGroup
        ? 'group'
        : dialog.isChannel
          ? 'channel'
          : dialog.isUser
            ? 'user'
            : 'unknown',
    }));
  }

  async getMe() {
    return this.client.getMe();
  }

  async sendMessage(chatId: string | number, message: string): Promise<void> {
    await this.client.sendMessage(chatId, { message });
  }

  async getChannelMessages(channelId: string | number, limit = 100) {
    return this.client.getMessages(channelId, { limit });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      await this.client.destroy();
      this.logger.log('Telegram client disconnected');
    }
  }

  getClient(): TelegramClient {
    return this.client;
  }

  getAuthState(): { ready: boolean; waitingFor: string | null } {
    if (!this.client) return { ready: false, waitingFor: null };
    if (this.authCodeResolver) return { ready: false, waitingFor: 'code' };
    if (this.authPasswordResolver)
      return { ready: false, waitingFor: 'password' };
    return { ready: true, waitingFor: null };
  }

  submitCode(code: string): void {
    if (!this.authCodeResolver) {
      throw new Error('No pending auth code request');
    }
    this.authCodeResolver(code);
    this.authCodeResolver = null;
  }

  submitPassword(password: string): void {
    if (!this.authPasswordResolver) {
      throw new Error('No pending auth password request');
    }
    this.authPasswordResolver(password);
    this.authPasswordResolver = null;
  }
}
