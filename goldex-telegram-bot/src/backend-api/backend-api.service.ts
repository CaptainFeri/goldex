import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import appEnvConfig from '../config/app.env.config';
import {
  BackendApiResponse,
  AuthTokensResponse,
  SendOtpResponse,
  WalletData,
  ProfileData,
  QuoteRequestResult,
  QuoteRequestItem,
  PricePairData,
} from '../shared/interface';

@Injectable()
export class BackendApiService {
  private readonly logger = new Logger(BackendApiService.name);
  private readonly baseUrl: string;
  private readonly apiPrefix: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService<
      ConfigType<typeof appEnvConfig>
    >,
  ) {
    const backendConfig = this.configService.get('backend', { infer: true });
    this.baseUrl = backendConfig.baseUrl;
    this.apiPrefix = backendConfig.apiPrefix;
  }

  private url(path: string): string {
    return `${this.baseUrl}${this.apiPrefix}${path}`;
  }

  private readonly USER_AGENT = 'GoldexBot/1.0 (Linux; Android 14; Telegram)';

  private authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'User-Agent': this.USER_AGENT,
    };
  }

  async sendOtp(phone: string): Promise<SendOtpResponse> {
    this.logger.log(`Sending OTP to ${phone}`);
    const res = await firstValueFrom(
      this.httpService.post<BackendApiResponse<SendOtpResponse>>(
        this.url('/auth/send-otp'),
        { phone },
      ),
    );
    return res.data.data;
  }

  async loginWithOtp(phone: string, otp: string): Promise<AuthTokensResponse> {
    this.logger.log(`Logging in with OTP for ${phone}`);
    const res = await firstValueFrom(
      this.httpService.post<BackendApiResponse<AuthTokensResponse>>(
        this.url('/auth/login-with-otp'),
        { phone, otp },
        { headers: { 'User-Agent': this.USER_AGENT } },
      ),
    );
    return res.data.data;
  }

  async getWallets(accessToken: string): Promise<WalletData[]> {
    const res = await firstValueFrom(
      this.httpService.get<BackendApiResponse<WalletData[]>>(
        this.url('/user-wallet'),
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return res.data.data;
  }

  async getProfile(accessToken: string): Promise<ProfileData> {
    const res = await firstValueFrom(
      this.httpService.get<BackendApiResponse<ProfileData>>(
        this.url('/profile/profile'),
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return res.data.data;
  }

  async sendToChannel(channelId: string, message: string): Promise<void> {
    this.logger.log(`Sending message to channel ${channelId}`);
    await firstValueFrom(
      this.httpService.post(this.url('/admin/channel/send'), {
        channelId,
        message,
      }),
    );
  }

  async getPricePairs(accessToken: string): Promise<PricePairData[]> {
    const res = await firstValueFrom(
      this.httpService.get<BackendApiResponse<PricePairData[]>>(
        this.url('/quote-requests/pairs'),
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return res.data.data;
  }

  async createQuoteRequest(
    accessToken: string,
    data: { side: string; pricePairId: string; quantity: number; price?: number; notes?: string },
  ): Promise<QuoteRequestResult> {
    const res = await firstValueFrom(
      this.httpService.post<BackendApiResponse<QuoteRequestResult>>(
        this.url('/quote-requests'),
        data,
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return res.data.data;
  }

  async getMyQuoteRequests(accessToken: string): Promise<QuoteRequestItem[]> {
    const res = await firstValueFrom(
      this.httpService.get<BackendApiResponse<QuoteRequestItem[]>>(
        this.url('/quote-requests/my'),
        { headers: this.authHeaders(accessToken) },
      ),
    );
    return res.data.data;
  }

  async cancelQuoteRequest(accessToken: string, id: string): Promise<void> {
    await firstValueFrom(
      this.httpService.delete(
        this.url(`/quote-requests/${id}`),
        { headers: this.authHeaders(accessToken) },
      ),
    );
  }

  async linkTelegram(accessToken: string, telegramId: number): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        this.url('/user-telegram/link'),
        { telegramId },
        { headers: this.authHeaders(accessToken) },
      ),
    );
  }
}
