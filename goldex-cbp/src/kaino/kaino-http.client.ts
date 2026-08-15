import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosResponse } from "axios";
import { firstValueFrom } from "rxjs";

/**
 * Thin axios wrapper around the Kaino wallet API.
 * Sends `Authorization: Bearer <token>` once KainoAuthService logged in,
 * and transparently re-authenticates once when a request comes back 401.
 */
@Injectable()
export class KainoHttpClient {
  private readonly baseUrl: string;
  private token: string | null = null;
  onUnauthorized?: () => Promise<void>;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get("app", { infer: true }).kaino.baseUrl;
  }

  setToken(token: string): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }

  async post<T>(path: string, body: object): Promise<T> {
    return this.send(() =>
      firstValueFrom(
        this.http.post<T>(`${this.baseUrl}${path}`, body, {
          headers: this.headers(),
        }),
      ),
    );
  }

  async get<T>(path: string, params: object): Promise<T> {
    return this.send(() =>
      firstValueFrom(
        this.http.get<T>(`${this.baseUrl}${path}`, {
          params,
          headers: this.headers(),
        }),
      ),
    );
  }

  private async send<T>(exec: () => Promise<AxiosResponse<T>>): Promise<T> {
    // Only re-login when the failing request actually carried a token. The
    // login call itself carries none, so a 401 there means bad credentials and
    // must throw — otherwise invalid creds cause an infinite re-login loop and
    // the health check hangs until the caller's timeout.
    const hadToken = !!this.token;
    try {
      const res = await exec();
      return res.data;
    } catch (err) {
      if (hadToken && (err as any)?.response?.status === 401 && this.onUnauthorized) {
        await this.onUnauthorized();
        const res = await exec();
        return res.data;
      }
      throw err;
    }
  }
}
