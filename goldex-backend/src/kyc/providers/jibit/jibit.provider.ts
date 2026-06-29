import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { IKycProvider, KycProviderType } from "../../interfaces/kyc-provider.interface";

@Injectable()
export class JibitProvider implements IKycProvider {
  readonly provider = KycProviderType.JIBIT;

  private readonly logger = new Logger(JibitProvider.name);

  private readonly apiKey = process.env.JIBIT_API_KEY;

  private readonly secretKey = process.env.JIBIT_SECRET_KEY;

  private readonly baseUrl = "https://napi.jibit.ir/ide";

  private accessToken: string | null = null;

  private refreshToken: string | null = null;

  private accessTokenExpiresAt = 0;

  constructor(private readonly httpService: HttpService) {}

  private async fetchToken() {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/v1/tokens/generate`, {
          apiKey: this.apiKey,
          secretKey: this.secretKey,
        })
      );

      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;

      this.accessTokenExpiresAt = Date.now() + 23.9 * 60 * 60 * 1000;

      return this.accessToken;
    } catch (error) {
      this.logger.error(`Failed to fetch Jibit token: ${error}`);
      throw this.handleJibitError(error);
    }
  }

  private async ensureToken() {
    if (!this.accessToken || Date.now() > this.accessTokenExpiresAt) {
      await this.fetchToken();
    }

    return this.accessToken!;
  }

  async getAccessToken() {
    return this.ensureToken();
  }

  private handleJibitError(error: any): Error {
    if (error) {
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      const customError = new Error(`Jibit API Error: ${statusCode}`);
      (customError as any).jibitError = true;
      (customError as any).statusCode = statusCode;
      (customError as any).responseData = errorData;

      return customError;
    }

    return error;
  }

  async matchMobileAndNationalId(nationalId: string, mobile: string): Promise<boolean | any> {
    try {
      const token = await this.ensureToken();

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v1/services/matching`, {
          params: {
            nationalCode: nationalId,
            mobileNumber: mobile,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      return !!data.matched;
    } catch (error) {
      return this.handleApiError(error);
    }
  }

  private handleApiError(error: any): { success: boolean; statusCode: number; data?: any; message?: string } {
    if (error) {
      const statusCode = error.response?.status || 500;
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message;

      this.logger.error(`Jibit API error (${statusCode}): ${errorMessage}`);

      // Return a structured response based on status code
      return {
        success: false,
        statusCode: statusCode,
        data: errorData,
        message: errorMessage,
      };
    }

    // Handle non-Axios errors
    return {
      success: false,
      statusCode: 500,
      message: error.message,
    };
  }

  async verifyBankAccount(
    bank: string,
    depositNumber: string,
    nationalId: string,
    birthDate: string,
    iban: string
  ): Promise<boolean> {
    try {
      const token = await this.ensureToken();

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v1/services/matching`, {
          params: {
            bank,
            depositNumber,
            nationalCode: nationalId,
            birthDate,
            iban,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      return !!data.matched;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async getCardInfo(cardNumber: string) {
    try {
      const token = await this.ensureToken();

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v1/cards`, {
          params: {
            number: cardNumber,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      return data;
    } catch (error) {
      return this.handleApiError(error);
    }
  }

  async getIbanInfo(iban: string) {
    try {
      const token = await this.ensureToken();

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v1/ibans`, {
          params: {
            value: iban,
          },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      return data;
    } catch (error) {
      return this.handleApiError(error);
    }
  }
}
