import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OtpHandler, OtpResult } from '../types/otp.types';
import { ProviderEntity } from '../entity/provider.entity';

@Injectable()
export class ZaryarOtpHandler implements OtpHandler {
  constructor(private readonly httpService: HttpService) {}

  async sendOtp(provider: ProviderEntity, phone: string): Promise<void> {
    const url =
      provider.sendOtpUrl ||
      (() => {
        return `${provider.sendOtpUrl}`;
      })();
    await firstValueFrom(
      this.httpService.post(
        url,
        { MobileNumber: phone },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
  }

  async verifyOtp(provider: ProviderEntity, otp: string): Promise<OtpResult> {
    const mobile = provider.phone || provider.auth?.mobile;
    if (!mobile) throw new Error('No phone number stored for this provider');

    const verifyUrl =
      provider.verifyCodeUrl ||
      (() => {
        return `${provider.verifyCodeUrl}`;
      })();
    const body = {
      EnterCode: true,
      MobileNumber: mobile,
      ConfirmCode: otp,
      error: '',
      spinner: false,
      submitted: false,
      CaptchaToken: '',
      renderSplashScreen: true,
    };
    const response = await firstValueFrom(
      this.httpService.post(verifyUrl, body, {
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const data = response.data;
    if (!data.IsSuccess) {
      throw new Error(data.Message || 'Verification failed');
    }
    const user = data.Data?.user;
    if (!user) throw new Error('No user data');

    const extra: Record<string, any> = {
      uId: user.uId,
      userId: user.userId,
      roleType: user.roleType || provider.auth?.roleType || '0',
    };

    extra.sessionId = user.sessionId ? user.sessionId : provider.auth?.sessionId;
    extra.shopkeeperId = user.shopkeeperId ? user.shopkeeperId : provider.auth?.shopkeeperId;

    return {
      token: user.token,
      extra,
    };
  }
}
