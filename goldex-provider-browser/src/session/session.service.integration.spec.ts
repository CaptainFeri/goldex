import { SessionService } from './session.service';

/**
 * The session lifecycle against a real browser.
 *
 * The rest of this service is pure logic with unit tests. What those cannot
 * show is the part the whole feature rests on: that a screencast actually
 * produces frames, and that an input event dispatched over CDP actually lands
 * in the page. Both are assumptions about Chromium, and assumptions about
 * Chromium are worth checking against Chromium.
 *
 * Skipped when no browser is available, so a machine without one still runs
 * the rest of the suite.
 */
const canLaunch = async (): Promise<boolean> => {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH?.trim() || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    await browser.close();
    return true;
  } catch {
    return false;
  }
};

describe('browser session', () => {
  let available = false;
  let service: SessionService;

  beforeAll(async () => {
    available = await canLaunch();
  }, 60000);

  beforeEach(() => {
    service = new SessionService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  const maybe = (name: string, fn: () => Promise<void>, timeout = 60000) =>
    it(name, async () => {
      if (!available) {
        console.warn(`skipped (no browser available): ${name}`);
        return;
      }
      await fn();
    }, timeout);

  describe('a browser that will not start', () => {
    /**
     * How a version mismatch between the Playwright client and the browser the
     * image ships actually presents: the launch throws, and without this the
     * admin was told "Internal server error" and learned nothing about it.
     */
    it('says what went wrong instead of failing blankly', async () => {
      const previous = process.env.CHROMIUM_EXECUTABLE_PATH;
      process.env.CHROMIUM_EXECUTABLE_PATH = '/nonexistent/chrome';
      try {
        await expect(
          service.open({ providerKey: 'p', loginUrl: 'https://panel.example.ir/login' }),
        ).rejects.toThrow(/Could not launch a browser/);
      } finally {
        if (previous === undefined) delete process.env.CHROMIUM_EXECUTABLE_PATH;
        else process.env.CHROMIUM_EXECUTABLE_PATH = previous;
      }
    }, 60000);

    it('reports it as a service fault, not a bad request', async () => {
      const previous = process.env.CHROMIUM_EXECUTABLE_PATH;
      process.env.CHROMIUM_EXECUTABLE_PATH = '/nonexistent/chrome';
      try {
        await service
          .open({ providerKey: 'p', loginUrl: 'https://panel.example.ir/login' })
          .then(
            () => {
              throw new Error('expected the launch to fail');
            },
            (err: any) => expect(err.getStatus?.()).toBe(503),
          );
      } finally {
        if (previous === undefined) delete process.env.CHROMIUM_EXECUTABLE_PATH;
        else process.env.CHROMIUM_EXECUTABLE_PATH = previous;
      }
    }, 60000);
  });

  describe('refusals that need no browser', () => {
    it('will not open a provider with no public URL', async () => {
      await expect(
        service.open({ providerKey: 'p', loginUrl: 'http://mock:5000/login' }),
      ).rejects.toThrow(/no public URL/i);
    });

    it('will not open an internal address dressed as a login page', async () => {
      await expect(
        service.open({ providerKey: 'p', loginUrl: 'http://169.254.169.254/' }),
      ).rejects.toThrow(/no public URL/i);
    });
  });

  maybe('streams the page and accepts input', async () => {
    const frames: string[] = [];
    service.bindEvents({
      onFrame: (_id, data) => void frames.push(data),
      onCaptured: () => undefined,
      onClosed: () => undefined,
      onBlocked: () => undefined,
      onNavigationFailed: () => undefined,
    });

    const session = await service.open({
      providerKey: 'zaryar',
      // Never resolved: the navigation is not awaited, and what is being
      // checked here is the screencast and the input path, not the provider.
      loginUrl: 'https://panel.example.ir/login',
      useProxy: false,
    });

    expect(session.allowedHosts).toEqual(['panel.example.ir']);
    expect(session.captured).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(frames.length).toBeGreaterThan(0);

    // A click and a keystroke, the two things the admin does to log in.
    await service.dispatch(session.id, {
      kind: 'mouse',
      type: 'mousePressed',
      x: 10,
      y: 10,
      button: 'left',
      clickCount: 1,
    });
    await service.dispatch(session.id, { kind: 'key', type: 'keyDown', text: 'a' });

    await expect(
      service.dispatch(session.id, { kind: 'nonsense' }),
    ).rejects.toThrow(/Unknown input kind/);
  });

  maybe('holds one session per provider', async () => {
    const first = await service.open({
      providerKey: 'zaryar',
      loginUrl: 'https://panel.example.ir/login',
      useProxy: false,
    });

    await expect(
      service.open({ providerKey: 'zaryar', loginUrl: 'https://panel.example.ir/login' }),
    ).rejects.toThrow(/already open/i);

    // …and the provider is free again once that session ends.
    await service.close(first.id);
    const second = await service.open({
      providerKey: 'zaryar',
      loginUrl: 'https://panel.example.ir/login',
      useProxy: false,
    });
    expect(second.id).not.toBe(first.id);
  });

  maybe('forgets everything about a session once it closes', async () => {
    const closed: string[] = [];
    service.bindEvents({
      onFrame: () => undefined,
      onCaptured: () => undefined,
      onClosed: (id) => void closed.push(id),
      onBlocked: () => undefined,
      onNavigationFailed: () => undefined,
    });

    const session = await service.open({
      providerKey: 'talaab',
      loginUrl: 'https://panel.example.ir/login',
      useProxy: false,
    });
    expect(service.list()).toHaveLength(1);

    await service.close(session.id);

    expect(closed).toEqual([session.id]);
    expect(service.list()).toHaveLength(0);
    expect(() => service.get(session.id)).toThrow(/not found/i);
    await expect(service.dispatch(session.id, { kind: 'key' })).rejects.toThrow(/not found/i);
  });

  maybe('refuses to hand over credentials it has not captured', async () => {
    const session = await service.open({
      providerKey: 'zaryar',
      loginUrl: 'https://panel.example.ir/login',
      useProxy: false,
    });
    expect(() => service.captured(session.id)).toThrow(/No credentials captured/i);
  });
});
