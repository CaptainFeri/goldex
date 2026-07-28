import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Api, TelegramClient } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import {
  CallbackQuery,
  CallbackQueryEvent,
} from 'telegram/events/CallbackQuery';
import type { Dialog } from 'telegram/tl/custom/dialog';
import { TELEGRAM_OPTIONS } from './telegram.constants';
import type { TelegramOptions } from './interfaces';
import { SessionManagerService } from './session-manager.service';
import { StructuredLogger } from '../logger/structured-logger';
import { CustomFile } from 'telegram/client/uploads';
import { PriceHistoryService } from './price/price-history.service';
import { ChartImageService } from './price/chart-image.service';
import { parsePriceMessage } from './price/price-message.parser';
import { formatArbitrageMessage } from './price/price-message.formatter';
import type { ArbitrageOpportunity, OrderButton } from './price/price.types';

type Entity = Api.User | Api.Chat | Api.Channel;

function entityDisplayName(entity: Entity): string {
  if ('title' in entity) return (entity as Api.Chat | Api.Channel).title;
  if ('firstName' in entity) return (entity as Api.User).firstName ?? (entity as Api.User).username ?? 'unknown';
  return 'unknown';
}

function entityIdStr(entity: Entity): string {
  return String(entity.id);
}

function entityUsername(entity: Entity): string | undefined {
  if ('username' in entity) return (entity as Api.Channel).username;
  return undefined;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(TelegramService.name);
  private client!: TelegramClient;
  private monitoredPeerIds: string[] = [];
  private targetPeerId: string | null = null;

  private authCodeResolver: ((code: string) => void) | null = null;
  private authPasswordResolver: ((password: string) => void) | null = null;

  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(TELEGRAM_OPTIONS)
    private readonly options: TelegramOptions,
    private readonly eventEmitter: EventEmitter2,
    private readonly priceHistory: PriceHistoryService,
    private readonly chartImage: ChartImageService,
    private readonly sessionManager: SessionManagerService,
  ) {
    this.sessionManager.setSessionFolder(this.options.sessionFolder || 'sessions');
  }

  async onModuleInit(): Promise<void> {
    await this.initClient();
  }

  private async initClient(sessionString?: string): Promise<boolean> {
    const ss = sessionString || this.options.sessionString
      || await this.sessionManager.loadSessionString();
    const session = this.sessionManager.createSession(ss || undefined);

    this.client = new TelegramClient(
      session,
      this.options.apiId,
      this.options.apiHash,
      {
        connectionRetries: 5,
        timeout: 15_000,
        retryDelay: 2_000,
        useWSS: true,
        autoReconnect: true,
      },
    );

    const connected = await this.connectWithRetry();
    if (!connected) {
      this.logger.warn(
        'Could not connect to Telegram. Run POST /api/auth/retry once network is available.',
      );
      return false;
    }

    const isAuthorized = await this.client.isUserAuthorized();

    if (isAuthorized) {
      this.logger.log('User already authorized');
      await this.finalizeInitialization();
      this.startHealthCheck();
      return true;
    }

    this.logger.log(
      'Authentication required. Waiting for code via POST /api/auth/code...',
    );
    this.startDeferredAuth();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    await this.disconnect();
  }

  private async finalizeInitialization(): Promise<void> {
    this.logger.log('Telegram client initialized');
    await this.resolveMonitoredChannels();
    await this.resolveTargetChannel();
    this.registerEventHandlers();
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
          const e = err as { code?: unknown; errorMessage?: unknown };
          if (e.code) this.logger.error(`Error code: ${String(e.code)}`);
          if (e.errorMessage) this.logger.error(`Error message: ${String(e.errorMessage)}`);
        },
      })
      .then(async () => {
        await this.persistSession();
        await this.finalizeInitialization();
        this.startHealthCheck();
      })
      .catch((err) => {
        this.logger.error('Auth failed', err);
        const e = err as { code?: unknown; errorMessage?: unknown };
        if (e.code) this.logger.error(`Error code: ${String(e.code)}`);
        if (e.errorMessage) this.logger.error(`Error message: ${String(e.errorMessage)}`);
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
      const e = err as { code?: unknown; errorMessage?: unknown };
      if (e.code) this.logger.error(`Error code: ${String(e.code)}`);
      if (e.errorMessage) this.logger.error(`Error message: ${String(e.errorMessage)}`);
      return null;
    }
  }

  private async connectWithRetry(): Promise<boolean> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Connecting to Telegram (attempt ${attempt}/${maxAttempts})...`);
        await this.client.connect();
        this.logger.log('Connected to Telegram successfully');
        return true;
      } catch (error) {
        this.logger.error(
          `Connection attempt ${attempt}/${maxAttempts} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (attempt < maxAttempts) {
          const delay = attempt * 5_000;
          this.logger.log(`Retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    return false;
  }

  private async persistSession(): Promise<void> {
    try {
      const saved = this.client.session.save() as unknown;
      const savedSession = typeof saved === 'string' ? saved : null;
      if (savedSession) {
        await this.sessionManager.saveSessionString(savedSession);
      }
    } catch (error) {
      this.logger.error('Failed to persist session', error);
    }
  }

  private startHealthCheck(): void {
    const INTERVAL_MS = 60_000;
    this.healthCheckTimer = setInterval(async () => {
      try {
        if (!this.client.connected) {
          this.logger.warn('Connection lost. Attempting reconnect...');
          await this.connectWithRetry();
          return;
        }
        const authorized = await this.client.isUserAuthorized();
        if (!authorized) {
          this.logger.warn('Session expired. Attempting reconnection...');
          await this.connectWithRetry();
        }
      } catch (error) {
        this.logger.error('Health check failed', error);
      }
    }, INTERVAL_MS);
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
          const entity = await this.client.getEntity(id) as Entity;
          this.monitoredPeerIds.push(entityIdStr(entity));
          this.logger.log(
            `Monitoring: ${entityDisplayName(entity)}`,
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
        const entity = await this.client.getEntity(id) as Entity;
        this.targetPeerId = entityIdStr(entity);
        this.logger.log(
          `Target channel resolved: ${entityDisplayName(entity)}`,
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
    const chat = await message.getChat() as Entity | undefined;
    const sender = await message.getSender() as Entity | undefined;
    const chatTitle = chat ? entityDisplayName(chat) : chatId;
    const senderName = sender ? entityDisplayName(sender) : 'unknown';

    const msgData = {
      type: 'NEW_MESSAGE' as const,
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

  private async sendPhotoToTarget(
    image: Buffer,
    caption: string,
  ): Promise<void> {
    if (!this.targetPeerId) return;
    const entity = await this.client.getInputEntity(this.targetPeerId);
    const file = new CustomFile('chart.png', image.length, 'chart.png', image);
    await this.client.sendFile(entity, { file, caption });
  }

  private firstOrderButton(
    replyMarkup?: Api.TypeReplyMarkup,
  ): OrderButton | undefined {
    return this.extractButtons(replyMarkup)[0]?.[0];
  }

  private extractButtons(
    replyMarkup?: Api.TypeReplyMarkup,
  ): { text: string; url?: string; data?: string }[][] {
    if (!replyMarkup) return [];
    if (!('rows' in replyMarkup)) return [];
    return replyMarkup.rows.map((row: { buttons: Api.TypeKeyboardButton[] }) =>
      (row.buttons ?? []).map((btn) => {
        const data = 'data' in btn
          ? (btn.data instanceof Buffer ? btn.data.toString('utf-8') : String(btn.data))
          : undefined;
        return {
          text: btn.text,
          url: 'url' in btn ? btn.url : undefined,
          data,
        };
      }),
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

    const sender = event.sender as Entity | undefined;
    const chat = await event.getChat() as Entity | undefined;

    this.logger.logStructured('CALLBACK_QUERY', {
      queryId: query.queryId?.toString(),
      senderId: sender?.id?.toString(),
      senderName: sender ? entityDisplayName(sender) : 'unknown',
      chatId: chat?.id?.toString(),
      chatTitle: chat ? entityDisplayName(chat) : '',
      data: dataStr,
      parts,
      messageId: event.messageId,
    });

    await event.answer();

    this.eventEmitter.emit('telegram.callbackQuery', {
      queryId: query.queryId?.toString(),
      senderId: sender?.id?.toString(),
      senderName: sender ? entityDisplayName(sender) : 'unknown',
      chatId: chat?.id?.toString(),
      chatTitle: chat ? entityDisplayName(chat) : '',
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
      title: dialog.title || dialog.name || dialog.entity?.className || 'unknown',
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

  async retryConnection(sessionString?: string): Promise<boolean> {
    try {
      if (this.client?.connected) {
        await this.disconnect();
      }
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
        this.healthCheckTimer = null;
      }
      return await this.initClient(sessionString);
    } catch (error) {
      this.logger.error('Retry connection failed', error);
      return false;
    }
  }

  getSessionString(): string | null {
    try {
      const session = this.client?.session;
      if (!session) return null;
      const saved = session.save() as unknown;
      if (typeof saved !== 'string' || !saved) return null;
      return saved;
    } catch {
      return null;
    }
  }

  async importSession(sessionString: string): Promise<boolean> {
    if (!sessionString) return false;
    await this.sessionManager.saveSessionString(sessionString);
    process.env.TELEGRAM_SESSION_STRING = sessionString;
    this.logger.log('Session imported. Reconnecting...');
    return this.retryConnection(sessionString);
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
