import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface BrowserSessionSummary {
  id: string;
  providerKey: string;
  loginUrl: string;
  allowedHosts: string[];
  expiresAt: string;
  captured: boolean;
}

export interface CapturedCredentials {
  auth: Record<string, string | number>;
  sourceUrl: string;
}

/**
 * Talks to `goldex-provider-browser` over the docker network.
 *
 * That service publishes no port, so this is the only way in, and the service
 * token below is what tells it the request came from here rather than from
 * something else that reached the port. The admin's own authorisation happened
 * at the controller.
 */
@Injectable()
export class ProviderBrowserClient {
  private readonly logger = new Logger(ProviderBrowserClient.name);

  constructor(private readonly http: HttpService) {}

  get enabled(): boolean {
    return !!(this.baseUrl && this.token);
  }

  get baseUrl(): string {
    return (
      process.env.PROVIDER_BROWSER_URL?.trim() || 'http://goldex-provider-browser:3000'
    );
  }

  private get token(): string {
    return process.env.BROWSER_SERVICE_TOKEN?.trim() ?? '';
  }

  private assertConfigured(): void {
    if (!this.token) {
      throw new ServiceUnavailableException(
        'The provider browser is not configured on this deployment',
      );
    }
  }

  private async call<T>(method: 'get' | 'post' | 'delete', path: string, body?: unknown): Promise<T> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.http.request<T>({
          method,
          url: `${this.baseUrl}${path}`,
          data: body,
          headers: { 'x-service-token': this.token },
          timeout: 30000,
        }),
      );
      return response.data;
    } catch (err: any) {
      const status = err?.response?.status;
      const message =
        err?.response?.data?.message ?? err?.message ?? 'The provider browser did not answer';
      // Its refusals are the admin's to see — "already open", "no public URL",
      // "nothing captured yet" are all answers, not outages. So is a 503: the
      // service saying it cannot serve (a browser it could not launch, say) is
      // a real answer about a real condition, and relabelling it 502 would only
      // blur where the fault is.
      if (status && ((status >= 400 && status < 500) || status === 503)) {
        throw new HttpException(message, status);
      }
      this.logger.error(`provider-browser ${method.toUpperCase()} ${path} failed: ${message}`);
      throw new BadGatewayException(message);
    }
  }

  open(body: {
    providerKey: string;
    loginUrl: string;
    otherUrls?: string[];
    useProxy?: boolean;
  }): Promise<BrowserSessionSummary> {
    return this.call<BrowserSessionSummary>('post', '/sessions', body);
  }

  get(id: string): Promise<BrowserSessionSummary> {
    return this.call<BrowserSessionSummary>('get', `/sessions/${id}`);
  }

  captured(id: string): Promise<CapturedCredentials> {
    return this.call<CapturedCredentials>('get', `/sessions/${id}/captured`);
  }

  close(id: string): Promise<{ closed: boolean }> {
    return this.call<{ closed: boolean }>('delete', `/sessions/${id}`);
  }
}
