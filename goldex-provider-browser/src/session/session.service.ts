import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import {
  captureAuth,
  captureFromStorage,
  mightCarryAuth,
  type CapturedAuth,
} from './auth-capture';
import {
  allowedHostsFor,
  isAppDownload,
  isNavigationAllowed,
} from './navigation-allowlist';
import {
  BROWSER_LOCALE,
  BROWSER_TIMEZONE,
  desktopUserAgent,
} from './browser-identity';

export interface OpenSessionRequest {
  providerKey: string;
  /** Where the login lives, plus every other host this provider answers on. */
  loginUrl: string;
  otherUrls?: (string | undefined | null)[];
  /** Mirrors the provider's own `useProxy`, so the browser egresses as the engine would. */
  useProxy?: boolean;
  viewport?: { width: number; height: number };
  /** The provider's category, which decides what a session of its looks like. */
  category?: string;
  /** Refuse the app the site pushes. On unless the admin wants to handle it. */
  blockAppDownloads?: boolean;
}

export interface SessionSummary {
  id: string;
  providerKey: string;
  loginUrl: string;
  /** Where the page actually is now, which is not always where it was sent. */
  currentUrl: string;
  allowedHosts: string[];
  expiresAt: string;
  captured: boolean;
  blockAppDownloads: boolean;
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
  storagePoll: NodeJS.Timeout;
  tokenAloneIsSession: boolean;
  /**
   * Whether the app the site pushes is refused.
   *
   * On by default, because it is what usually stops the login page appearing.
   * But a site that serves its real page through the same request this refuses
   * ends up blank either way, and there is a person watching who can simply
   * close a popup — so they can turn it off and deal with it themselves.
   */
  blockAppDownloads: boolean;
}

export interface SessionEvents {
  onFrame(sessionId: string, dataBase64: string): void;
  onCaptured(sessionId: string, captured: CapturedAuth): void;
  onClosed(sessionId: string, reason: string): void;
  onBlocked(sessionId: string, url: string): void;
  onNavigationFailed(sessionId: string, message: string): void;
}

/**
 * Turns Playwright's navigation errors into something an admin can act on.
 *
 * They are accurate and unhelpful in equal measure: "Download is starting" is
 * true, but what the admin needs to know is that the address they configured
 * points at a file rather than a login page.
 */
export function explainNavigationFailure(error: string): string {
  if (/Download is starting/i.test(error)) {
    return 'این آدرس به‌جای یک صفحه، یک فایل برمی‌گرداند. معمولاً یعنی آدرس پنل وب به ریشهٔ سایت اشاره می‌کند نه به صفحهٔ ورود — یا پاسخی که از پروکسی برگشته صفحهٔ واقعی سایت نیست.';
  }
  if (/ERR_PROXY|ERR_TUNNEL/i.test(error)) {
    return 'اتصال از طریق پروکسی برقرار نشد. اگر این تأمین‌کننده مستقیم در دسترس است، تیک «عبور از پروکسی» را در تنظیماتش بردارید.';
  }
  if (/ERR_NAME_NOT_RESOLVED/i.test(error)) {
    return 'نام دامنه پیدا نشد؛ آدرس پنل وب را بررسی کنید.';
  }
  if (/ERR_CONNECTION_|ERR_TIMED_OUT|Timeout/i.test(error)) {
    return 'سایت پاسخ نداد. اگر فقط از داخل ایران در دسترس است، تیک «عبور از پروکسی» باید روشن باشد.';
  }
  if (/ERR_CERT|SSL/i.test(error)) {
    return 'گواهی TLS سایت معتبر نیست.';
  }
  return error;
}

/** How long a session may stay open with nobody finishing it. */
const SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * How often the page's own storage is read.
 *
 * A person is logging in by hand, so a second and a half is imperceptible to
 * them and costs one tiny evaluate per tick.
 */
const STORAGE_POLL_MS = 1500;

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

    /**
     * One browser per provider — but by replacing the old one, not by refusing
     * the new one.
     *
     * Refusing it made any session that was not closed deliberately lock the
     * provider out of the feature until its TTL ran out: a closed tab, a
     * reload, a browser that crashed. The invariant worth keeping is that two
     * browsers are never logging into one provider at once, and taking over
     * keeps that just as well while leaving the admin a way forward.
     */
    const existing = this.byProvider.get(request.providerKey);
    if (existing && this.sessions.has(existing)) {
      this.logger.log(`[${existing}] replaced by a new session for ${request.providerKey}`);
      await this.close(existing, 'replaced by a new session');
    }

    const viewport = request.viewport ?? { width: 1280, height: 800 };
    const browser = await this.getBrowser();
    // A fresh context every time, never persisted: one activation must not
    // leave a logged-in session behind for the next one to inherit.
    const context = await browser.newContext({
      viewport,
      proxy: this.proxyOption(request.useProxy),
      ignoreHTTPSErrors: false,
      // Headless Chromium announces itself as HeadlessChrome on X11/Linux, and
      // a site that sniffs that reads it as a bot — which is how this browser
      // came to be handed an app download where the login page should be.
      userAgent: process.env.BROWSER_USER_AGENT?.trim() || desktopUserAgent(browser.version()),
      locale: BROWSER_LOCALE,
      timezoneId: BROWSER_TIMEZONE,
      // This browser exists to sign in to a panel. A download is never the
      // goal, and accepting one would write a file into the container for a
      // navigation that was already going nowhere.
      acceptDownloads: false,
    });

    const id = randomUUID();
    const page = await context.newPage();

    await context.route('**/*', async (route) => {
      const url = route.request().url();

      // Checked before the allowlist so the admin is told it was the app being
      // pushed at them, rather than some domain they have to reason about.
      if (isAppDownload(url) && this.sessions.get(id)?.blockAppDownloads !== false) {
        this.logger.log(`[${id}] refused an app download: ${url}`);
        this.events?.onBlocked(id, `${url} (دانلود اپ — رد شد)`);
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }

      if (isNavigationAllowed(url, allowedHosts)) {
        await route.continue().catch(() => undefined);
        return;
      }
      this.logger.warn(`[${id}] blocked ${url}`);
      this.events?.onBlocked(id, url);
      await route.abort('blockedbyclient').catch(() => undefined);
    });

    // Only the first page is streamed, so a popup would open somewhere the
    // admin cannot see and quietly take the login with it. Closing it leaves
    // them on the page they can actually drive.
    context.on('page', (popup) => {
      if (popup === page) return;
      // Only the first page is streamed, so a popup opens where the admin
      // cannot see it. Closing it keeps them on the page they can drive —
      // unless they have asked to deal with the site's interruptions
      // themselves, in which case its own content is theirs to handle.
      if (this.sessions.get(id)?.blockAppDownloads === false) return;
      this.logger.log(`[${id}] closed a popup: ${popup.url()}`);
      void popup.close().catch(() => undefined);
    });

    // Belt and braces behind `acceptDownloads: false` — a download that starts
    // anyway is cancelled rather than left holding the page.
    page.on('download', (download) => {
      this.logger.log(`[${id}] cancelled a download: ${download.url()}`);
      void download.cancel().catch(() => undefined);
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
      storagePoll: setInterval(() => void this.inspectStorage(id), STORAGE_POLL_MS),
      // Talaab's session really is the token and nothing else — its provider
      // reads `config.auth['token']` and never looks for more — so a bare token
      // in storage is the whole of it there, and refusing one would refuse the
      // only credentials that exist.
      tokenAloneIsSession: request.category === 'talaab',
      blockAppDownloads: request.blockAppDownloads ?? true,
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
      const raw = (err as Error).message?.split('\n')[0] ?? String(err);
      this.logger.warn(`[${id}] navigation failed: ${raw}`);
      // Told to the admin, not just the log. Without this the canvas simply
      // stays blank and the only account of why is in a container they cannot
      // read — the same way the launch failure used to disappear.
      this.events?.onNavigationFailed(id, explainNavigationFailure(raw));
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

      this.finishCapture(sessionId, captured);
    } catch {
      /* a body that cannot be read is simply not a login response */
    }
  }

  /**
   * Reads the page's own storage, for a login that leaves its session there
   * rather than in a response worth reading.
   *
   * Polled rather than hooked: there is no event for "the app wrote to
   * localStorage", and a person doing a login by hand will not notice a second
   * and a half. It stops as soon as something is captured.
   */
  private async inspectStorage(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.captured) return;
    try {
      const storages = await session.page.evaluate(() => {
        const read = (store: Storage): Record<string, string> => {
          const out: Record<string, string> = {};
          for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key) out[key] = store.getItem(key) ?? '';
          }
          return out;
        };
        return {
          local: read(window.localStorage),
          session: read(window.sessionStorage),
        };
      });

      const options = { tokenAloneIsSession: session.tokenAloneIsSession };
      const captured =
        captureFromStorage(storages.local, 'localStorage', options) ??
        captureFromStorage(storages.session, 'sessionStorage', options);
      if (!captured) return;

      this.finishCapture(sessionId, captured);
    } catch {
      /* the page may be navigating, or gone; the next tick will try again */
    }
  }

  /** Records a captured session once, from whichever side saw it first. */
  private finishCapture(sessionId: string, captured: CapturedAuth): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.captured) return;
    session.captured = captured;
    clearInterval(session.storagePoll);
    this.logger.log(`[${sessionId}] captured credentials from ${captured.sourceUrl}`);
    this.events?.onCaptured(sessionId, captured);
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

  /**
   * Sends the page somewhere else, within the same allowlist.
   *
   * The address a provider is configured with is a guess about where its login
   * lives, and a wrong guess used to mean rebuilding and trying again. A person
   * watching a browser can just try the next URL, so let them.
   */
  async navigate(id: string, url: string): Promise<SessionSummary> {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');

    if (!isNavigationAllowed(url, session.allowedHosts)) {
      throw new BadRequestException(
        `This browser may only reach ${session.allowedHosts.join(', ')}`,
      );
    }

    await session.page.goto(url, { waitUntil: 'domcontentloaded' }).catch((err) => {
      const raw = (err as Error).message?.split('\n')[0] ?? String(err);
      this.logger.warn(`[${id}] navigation failed: ${raw}`);
      this.events?.onNavigationFailed(id, explainNavigationFailure(raw));
    });
    return this.summarise(session);
  }

  /** Reload, and step back, for a page that went somewhere unhelpful. */
  async reload(id: string): Promise<SessionSummary> {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');
    await session.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return this.summarise(session);
  }

  async goBack(id: string): Promise<SessionSummary> {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');
    await session.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return this.summarise(session);
  }

  /**
   * Turns the app-download refusal on or off mid-session.
   *
   * Refusing it is usually what lets the login page appear at all. But a site
   * that serves its real page through the very request being refused ends up
   * blank either way — and there is a person watching who can close a popup
   * themselves, which is more than this can do by guessing.
   */
  setBlockAppDownloads(id: string, enabled: boolean): SessionSummary {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException('Session not found or already closed');
    session.blockAppDownloads = enabled;
    this.logger.log(`[${id}] app downloads ${enabled ? 'refused' : 'allowed'}`);
    return this.summarise(session);
  }

  async close(id: string, reason = 'closed'): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    clearTimeout(session.expiry);
    clearInterval(session.storagePoll);
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
      currentUrl: (() => {
        try {
          return session.page.url();
        } catch {
          return '';
        }
      })(),
      allowedHosts: session.allowedHosts,
      expiresAt: new Date(session.expiresAt).toISOString(),
      captured: !!session.captured,
      blockAppDownloads: session.blockAppDownloads,
    };
  }

  async onModuleDestroy(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.close(id, 'service shutting down');
    }
    await this.browser?.close().catch(() => undefined);
  }
}
