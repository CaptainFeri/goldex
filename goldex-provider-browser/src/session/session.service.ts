import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { captureAuth, mightCarryAuth, type CapturedAuth } from './auth-capture';
import { allowedHostsFor, isNavigationAllowed } from './navigation-allowlist';

export interface OpenSessionRequest {
  providerKey: string;
  /** Where the login lives, plus every other host this provider answers on. */
  loginUrl: string;
  otherUrls?: (string | undefined | null)[];
  /** Mirrors the provider's own `useProxy`, so the browser egresses as the engine would. */
  useProxy?: boolean;
  viewport?: { width: number; height: number };
}

export interface SessionSummary {
  id: string;
  providerKey: string;
  loginUrl: string;
  allowedHosts: string[];
  expiresAt: string;
  captured: boolean;
}

interface Session {
  id: string;
  providerKey: string;
  loginUrl: string;
  allowedHosts: string[];
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  expiry: NodeJS.Timeout;
  expiresAt: number;
  captured: CapturedAuth | null;
  viewport: { width: number; height: number };
}

export interface SessionEvents {
  onFrame(sessionId: string, dataBase64: string): void;
  onCaptured(sessionId: string, captured: CapturedAuth): void;
  onClosed(sessionId: string, reason: string): void;
  onBlocked(sessionId: string, url: string): void;
}

/** How long a session may stay open with nobody finishing it. */
const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private browser: Browser | null = null;
  private readonly sessions = new Map<string, Session>();
  /** One session per provider: two people driving one login race each other. */
  private readonly byProvider = new Map<string, string>();
  private events: SessionEvents | null = null;

  bindEvents(events: SessionEvents): void {
    this.events = events;
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    // Imported lazily so the service can be constructed — and its pure logic
    // tested — without a browser binary present.
    const { chromium } = await import('playwright');
    try {
      this.browser = await chromium.launch({
        // The image normally ships the matching build, but a host that provides
        // its own Chromium can point at it rather than fetching a second copy.
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      return this.browser;
    } catch (err) {
      // A launch failure is a deployment fault, not a bad request, and it must
      // arrive saying so. Left to Nest it becomes a bare 500 that reaches the
      // admin as "Internal server error" — which is how a Playwright version
      // that does not match the image's browser build looked from the panel:
      // like nothing in particular.
      const message = (err as Error).message?.split('\n')[0] ?? String(err);
      this.logger.error(`Could not launch a browser: ${message}`);
      throw new ServiceUnavailableException(`Could not launch a browser: ${message}`);
    }
  }

  private proxyOption(useProxy: boolean | undefined) {
    if (useProxy === false) return undefined;
    const host = process.env.PROXY_HOST?.trim();
    if (!host) return undefined;
    const port = process.env.PROXY_PORT?.trim() || '29180';
    const username = process.env.PROXY_USERNAME?.trim();
    return {
      server: `http://${host}:${port}`,
      ...(username ? { username, password: process.env.PROXY_PASSWORD ?? '' } : {}),
    };
  }

  async open(request: OpenSessionRequest): Promise<SessionSummary> {
    const allowedHosts = allowedHostsFor([request.loginUrl, ...(request.otherUrls ?? [])]);
    if (allowedHosts.length === 0) {
      throw new BadRequestException(
        'This provider has no public URL to open — set its web panel address first',
      );
    }
    if (!isNavigationAllowed(request.loginUrl, allowedHosts)) {
      throw new BadRequestException('The login URL is not a reachable public address');
    }

    const existing = this.byProvider.get(request.providerKey);
    if (existing && this.sessions.has(existing)) {
      throw new ConflictException(
        `A browser session for ${request.providerKey} is already open`,
      );
    }

    const viewport = request.viewport ?? { width: 1280, height: 800 };
    const browser = await this.getBrowser();
    // A fresh context every time, never persisted: one activation must not
    // leave a logged-in session behind for the next one to inherit.
    const context = await browser.newContext({
      viewport,
      proxy: this.proxyOption(request.useProxy),
      ignoreHTTPSErrors: false,
    });

    const id = randomUUID();
    const page = await context.newPage();

    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (isNavigationAllowed(url, allowedHosts)) {
        await route.continue().catch(() => undefined);
        return;
      }
      this.logger.warn(`[${id}] blocked ${url}`);
      this.events?.onBlocked(id, url);
      await route.abort('blockedbyclient').catch(() => undefined);
    });

    page.on('response', (response) => {
      void this.inspectResponse(id, response);
    });

    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', (frame: any) => {
      this.events?.onFrame(id, frame.data);
      void cdp
        .send('Page.screencastFrameAck', { sessionId: frame.sessionId })
        .catch(() => undefined);
    });

    const expiresAt = Date.now() + SESSION_TTL_MS;
    const session: Session = {
      id,
      providerKey: request.providerKey,
      loginUrl: request.loginUrl,
      allowedHosts,
      context,
      page,
      cdp,
      expiresAt,
      expiry: setTimeout(() => void this.close(id, 'expired'), SESSION_TTL_MS),
      captured: null,
      viewport,
    };
    this.sessions.set(id, session);
    this.byProvider.set(request.providerKey, id);

    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 60,
      maxWidth: viewport.width,
      maxHeight: viewport.height,
      everyNthFrame: 1,
    });

    // Not awaited: a login page that is slow, or never finishes loading its
    // analytics, must not hold up handing the session back. The admin watches
    // it arrive on the stream.
    void page.goto(request.loginUrl, { waitUntil: 'domcontentloaded' }).catch((err) => {
      this.logger.warn(`[${id}] navigation failed: ${(err as Error).message}`);
    });

    this.logger.log(`[${id}] opened for ${request.providerKey} at ${request.loginUrl}`);
    return this.summarise(session);
  }

  private async inspectResponse(sessionId: string, response: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.captured) return;
    try {
      const headers = response.headers();
      const contentType = headers['content-type'] ?? '';
      const length = Number(headers['content-length'] ?? '0');
      if (!mightCarryAuth(contentType, length || 0)) return;

      const body = await response.json().catch(() => null);
      const captured = captureAuth(body, response.url());
      if (!captured) return;

      session.captured = captured;
      this.logger.log(`[${sessionId}] captured credentials from ${captured.sourceUrl}`);
      this.events?.onCaptured(sessionId, captured);
    } catch {
      /* a body that cannot be read is simply not a login response */
    }
  }

  get(id: string): SessionSummary {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');
    return this.summarise(session);
  }

  captured(id: string): CapturedAuth {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');
    if (!session.captured) {
      throw new BadRequestException('No credentials captured yet — complete the login first');
    }
    return session.captured;
  }

  /** Forwards one input event from the admin's screen into the real page. */
  async dispatch(id: string, event: Record<string, any>): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');

    const { kind, ...rest } = event;
    if (kind === 'mouse') {
      await session.cdp.send('Input.dispatchMouseEvent', rest as any);
    } else if (kind === 'key') {
      await session.cdp.send('Input.dispatchKeyEvent', rest as any);
    } else if (kind === 'wheel') {
      await session.cdp.send('Input.dispatchMouseEvent', {
        ...rest,
        type: 'mouseWheel',
      } as any);
    } else {
      throw new BadRequestException(`Unknown input kind: ${String(kind)}`);
    }
  }

  async close(id: string, reason = 'closed'): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    clearTimeout(session.expiry);
    this.sessions.delete(id);
    if (this.byProvider.get(session.providerKey) === id) {
      this.byProvider.delete(session.providerKey);
    }

    // Torn down whatever happens: a context left open is a logged-in browser
    // session sitting in the server, and a leaked one never expires.
    await session.cdp.send('Page.stopScreencast').catch(() => undefined);
    await session.context.close().catch(() => undefined);

    this.logger.log(`[${id}] ${reason}`);
    this.events?.onClosed(id, reason);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map((s) => this.summarise(s));
  }

  private summarise(session: Session): SessionSummary {
    return {
      id: session.id,
      providerKey: session.providerKey,
      loginUrl: session.loginUrl,
      allowedHosts: session.allowedHosts,
      expiresAt: new Date(session.expiresAt).toISOString(),
      captured: !!session.captured,
    };
  }

  async onModuleDestroy(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.close(id, 'service shutting down');
    }
    await this.browser?.close().catch(() => undefined);
  }
}
