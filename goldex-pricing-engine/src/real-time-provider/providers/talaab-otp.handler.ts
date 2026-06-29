import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OtpHandler, OtpResult } from '../types/otp.types';
import { ProviderEntity } from '../entity/provider.entity';

@Injectable()
export class TalaabOtpHandler implements OtpHandler {
  constructor(private readonly httpService: HttpService) {}

  async sendOtp(provider: ProviderEntity, phone: string): Promise<void> {
    const url =
      provider.sendOtpUrl ||
      (() => {
        if (!provider.apiBaseUrl) {
          throw new Error('apiBaseUrl is required for Talaab provider');
        }
        return `${provider.sendOtpUrl}`;
      })();
    await firstValueFrom(
      this.httpService.post(
        url,
        { mobile: phone, user_type: 1 },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  }

  async verifyOtp(provider: ProviderEntity, otp: string): Promise<OtpResult> {
    const mobile = provider.phone || provider.auth?.mobile;
    if (!mobile) throw new Error('No phone number stored');

    const url =
      provider.verifyCodeUrl ||
      (() => {
        if (!provider.verifyCodeUrl) {
          throw new Error('apiBaseUrl is required for Talaab provider');
        }
        return `${provider.verifyCodeUrl}`;
      })();

    const body = { mobile, otp, password: null, type: 'otp' };
    const response = await firstValueFrom(
      this.httpService.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const data = response.data;
    if (!data.success) throw new Error(data.message || 'Login failed');
    const token = data.data?.token;
    if (!token) throw new Error('No token');

    return { token, extra: {} };
  }
}
