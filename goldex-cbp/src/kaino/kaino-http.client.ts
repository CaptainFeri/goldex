import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { AxiosResponse } from "axios";
import { firstValueFrom } from "rxjs";

/**
 * Thin axios wrapper around the Kaino wallet API.
 * Sends `Authorization: Bearer <token>` once KainoAuthService logged in,
 * and transparently re-authenticates once when a request comes back 401.
 * Every outbound call (method, URL, HTTP status) is logged for auditability.
 */
@Injectable()
export class KainoHttpClient {
  private readonly logger = new Logger(KainoHttpClient.name);
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
    return this.token ? { Authorization: this.token } : {};
  }

  private static readonly SECRET_KEYS = [
    "password",
    "oldPassword",
    "passwordConfirm",
    "token",
    "accessToken",
    "Authorization",
  ];

  private redactUrl(url: string): string {
    try {
      const u = new URL(url);
      const params = new URLSearchParams(u.search);
      for (const key of KainoHttpClient.SECRET_KEYS) {
        if (params.has(key)) params.set(key, "***");
      }
      u.search = params.toString();
      return u.toString();
    } catch {
      return url;
    }
  }

  private redactJson(value: any): string {
    if (value === undefined) return "";
    try {
      return JSON.stringify(this.redact(value));
    } catch {
      return String(value);
    }
  }

  private redact(value: any): any {
    if (Array.isArray(value)) return value.map((v) => this.redact(v));
    if (value && typeof value === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = KainoHttpClient.SECRET_KEYS.includes(k)
          ? "***"
          : this.redact(v);
      }
      return out;
    }
    return value;
  }

  private logReq(method: string, url: string, body: any = null): void {
    this.logger.log(
      `→ ${method} ${this.redactUrl(url)}${body ? `\n  body: ${this.redactJson(body)}` : ""}`,
    );
  }

  private logRes(method: string, url: string, res: AxiosResponse | { status: number; data?: any }): void {
    const data =
      res && (res as any).data !== undefined
        ? `\n  body: ${this.redactJson((res as any).data)}`
        : "";
    this.logger.log(
      `← ${method} ${this.redactUrl(url)} → ${res.status}${data}`,
    );
  }

  async post<T>(path: string, body: object, baseUrl?: string): Promise<T> {
    const url = `${baseUrl ?? this.baseUrl}${path}`;
    return this.send("POST", url, body, () =>
      firstValueFrom(
        this.http.post<T>(url, body, { headers: this.headers() }),
      ),
    );
  }

  async get<T>(path: string, params: object): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return this.send("GET", url, params, () =>
      firstValueFrom(
        this.http.get<T>(url, { params, headers: this.headers() }),
      ),
    );
  }

  private async send<T>(
    method: string,
    url: string,
    body: any,
    exec: () => Promise<AxiosResponse<T>>,
  ): Promise<T> {
    // Only re-login when the failing request actually carried a token. The
    // login call itself carries none, so a 401 there means bad credentials and
    // must throw — otherwise invalid creds cause an infinite re-login loop and
    // the health check hangs until the caller's timeout.
    const hadToken = !!this.token;
    this.logReq(method, url, body);
    try {
      const res = await exec();
      this.logRes(method, url, res);
      return res.data;
    } catch (err) {
      const res = (err as any)?.response as AxiosResponse | undefined;
      const status = res?.status;
      this.logger.warn(`✗ ${method} ${this.redactUrl(url)} → ${status ?? "ERR"}`);
      if (res) {
        this.logger.warn(
          `✗ response body: ${this.redactJson(res.data ?? "")}`,
        );
      }
      if (hadToken && status === 401 && this.onUnauthorized) {
        await this.onUnauthorized();
        this.logReq(method, url, body);
        const retry = await exec();
        this.logRes(method, url, retry);
        return retry.data;
      }
      throw err;
    }
  }
}
