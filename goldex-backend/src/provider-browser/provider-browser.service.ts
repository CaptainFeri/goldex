import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderService } from '../provider/provider.service';
import {
  ProviderBrowserClient,
  type BrowserSessionSummary,
} from './provider-browser.client';

/**
 * Opening a browser on a provider's own login page, and turning what that login
 * produces into an activated provider.
 *
 * The pieces already exist: `setAuth` is what stores credentials and starts the
 * provider, and it does not care whether a person found them by hand or a
 * browser here caught them coming back. This only gets the browser pointed at
 * the right provider and hands the result over.
 */
@Injectable()
export class ProviderBrowserService {
  private readonly logger = new Logger(ProviderBrowserService.name);

  constructor(
    private readonly client: ProviderBrowserClient,
    private readonly providers: ProviderService,
  ) {}

  async open(providerId: string): Promise<BrowserSessionSummary> {
    const provider = await this.providers.findOne(providerId);

    // The panel URL is where a person signs in; baseUrl and apiBaseUrl are
    // where that page's own requests go. Without them the allowlist would
    // block the login the moment it submitted.
    const loginUrl = provider.webPanelUrl?.trim();
    if (!loginUrl) {
      throw new BadRequestException(
        `Provider "${provider.key}" has no web panel address — set webPanelUrl before opening a browser on it`,
      );
    }

    const session = await this.client.open({
      providerKey: provider.key,
      loginUrl,
      otherUrls: [
        provider.baseUrl,
        provider.apiBaseUrl,
        provider.sendOtpUrl,
        provider.verifyCodeUrl,
      ].filter((url): url is string => !!url?.trim()),
      useProxy: provider.useProxy ?? true,
    });

    this.logger.log(
      `Opened browser session ${session.id} for ${provider.key}, limited to ${session.allowedHosts.join(', ')}`,
    );
    return session;
  }

  status(sessionId: string): Promise<BrowserSessionSummary> {
    return this.client.get(sessionId);
  }

  /**
   * Takes the credentials out of the browser and activates the provider with
   * them — the same path as credentials pasted by hand, so a refusal from the
   * engine reaches the admin the same way.
   */
  async activate(providerId: string, sessionId: string): Promise<{ message: string }> {
    const provider = await this.providers.findOne(providerId);
    const session = await this.client.get(sessionId);

    if (session.providerKey !== provider.key) {
      throw new BadRequestException(
        'That browser session belongs to a different provider',
      );
    }

    const captured = await this.client.captured(sessionId);
    try {
      const result = await this.providers.setAuth(providerId, captured.auth);
      this.logger.log(
        `Activated ${provider.key} from browser session ${sessionId} (${captured.sourceUrl})`,
      );
      return result;
    } finally {
      // Closed whether or not the engine accepted them. The login is over
      // either way, and a browser left open is a live signed-in session sitting
      // in the server until its TTL runs out.
      await this.client.close(sessionId).catch(() => undefined);
    }
  }

  async close(sessionId: string): Promise<{ closed: boolean }> {
    return this.client.close(sessionId);
  }
}
