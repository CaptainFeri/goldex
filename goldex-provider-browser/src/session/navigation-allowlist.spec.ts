import {
  allowedHostsFor,
  hostOf,
  isAppDownload,
  isInternalHost,
  isNavigationAllowed,
} from './navigation-allowlist';

/**
 * The rule that keeps a remote-controlled browser from being a request forgery
 * tool with a human at the controls. Everything else in this service is a
 * convenience; this is the part that must not be wrong.
 */
describe('navigation allowlist', () => {
  const provider = allowedHostsFor([
    'https://panel.example.ir/login',
    'https://api.example.ir',
    undefined,
  ]);

  describe('the internal network is never reachable', () => {
    it.each([
      'localhost',
      'postgres',
      'redis',
      'rabbitmq',
      'goldex-backend',
      '127.0.0.1',
      '0.0.0.0',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '::1',
    ])('refuses %s', (host) => {
      expect(isInternalHost(host)).toBe(true);
    });

    it.each(['example.ir', 'panel.example.ir', '8.8.8.8', '172.32.0.1', '11.0.0.1'])(
      'allows the public host %s',
      (host) => {
        expect(isInternalHost(host)).toBe(false);
      },
    );

    /**
     * The link-local address that serves cloud instance credentials. Reaching
     * it from inside the network is the classic way a browser like this turns
     * into a credential leak.
     */
    it('refuses the cloud metadata endpoint even if a provider claimed it', () => {
      expect(isNavigationAllowed('http://169.254.169.254/latest/meta-data/', ['169.254.169.254'])).toBe(
        false,
      );
    });

    it('refuses an internal host that somehow got into the allowlist', () => {
      expect(isNavigationAllowed('http://postgres:5432/', ['postgres'])).toBe(false);
    });

    it('never lets an internal host into an allowlist in the first place', () => {
      expect(allowedHostsFor(['http://redis:6379', 'https://panel.example.ir'])).toEqual([
        'panel.example.ir',
      ]);
    });
  });

  describe("the provider's own hosts", () => {
    it('allows the login host', () => {
      expect(isNavigationAllowed('https://panel.example.ir/login', provider)).toBe(true);
    });

    it('allows another host the provider was configured with', () => {
      expect(isNavigationAllowed('https://api.example.ir/auth/verify', provider)).toBe(true);
    });

    it('allows a subdomain, because login pages load their own assets', () => {
      expect(isNavigationAllowed('https://cdn.panel.example.ir/app.js', provider)).toBe(true);
    });

    it('refuses an unrelated host', () => {
      expect(isNavigationAllowed('https://evil.example.com/steal', provider)).toBe(false);
    });

    // A suffix match without a label boundary would let notexample.ir through
    // by virtue of ending in the allowed string.
    it('refuses a host that merely ends with an allowed one', () => {
      expect(isNavigationAllowed('https://notpanel.example.ir.evil.com/', provider)).toBe(false);
      expect(isNavigationAllowed('https://evilpanel.example.ir/', ['panel.example.ir'])).toBe(
        false,
      );
    });

    it('matches regardless of case', () => {
      expect(isNavigationAllowed('https://PANEL.EXAMPLE.IR/login', provider)).toBe(true);
    });

    it('ignores the port', () => {
      expect(isNavigationAllowed('https://panel.example.ir:8443/login', provider)).toBe(true);
    });
  });

  describe('schemes', () => {
    it('allows the blank starting page', () => {
      expect(isNavigationAllowed('about:blank', provider)).toBe(true);
    });

    it('allows data and blob urls, which never leave the page', () => {
      expect(isNavigationAllowed('data:image/png;base64,AAAA', provider)).toBe(true);
      expect(isNavigationAllowed('blob:https://panel.example.ir/abc', provider)).toBe(true);
    });

    it('refuses file urls', () => {
      expect(isNavigationAllowed('file:///etc/passwd', provider)).toBe(false);
    });

    it('refuses anything unparseable', () => {
      expect(isNavigationAllowed('not a url', provider)).toBe(false);
      expect(isNavigationAllowed('', provider)).toBe(false);
    });
  });

  describe('an empty allowlist opens nothing', () => {
    it('refuses every url', () => {
      expect(isNavigationAllowed('https://panel.example.ir/login', [])).toBe(false);
    });

    it('is what a provider with no public url produces', () => {
      expect(allowedHostsFor([undefined, null, '', 'http://mock:5000'])).toEqual([]);
    });
  });

  describe('reading the host', () => {
    it('strips credentials and port', () => {
      expect(hostOf('https://user:pass@panel.example.ir:8443/x')).toBe('panel.example.ir');
    });

    it('returns nothing for a url it cannot parse', () => {
      expect(hostOf('nonsense')).toBe('');
    });
  });

  describe('the app being pushed at the visitor', () => {
    /**
     * Provider sites routinely push their mobile app the moment a page loads.
     * In a real browser a person closes it; here it starts a download in place
     * of the page and the canvas stays blank. This browser cannot install an
     * app, so nobody here wants the file.
     */
    it.each([
      'https://panel.example.ir/downloads/app.apk',
      'https://panel.example.ir/app.APK',
      'https://panel.example.ir/ios/app.ipa',
      'https://panel.example.ir/setup.exe',
      'https://panel.example.ir/app.aab',
    ])('refuses %s', (url) => {
      expect(isAppDownload(url)).toBe(true);
    });

    it('refuses a store link', () => {
      expect(isAppDownload('https://cafebazaar.ir/app/ir.example.app')).toBe(true);
      expect(isAppDownload('https://myket.ir/app/ir.example.app')).toBe(true);
      expect(isAppDownload('bazaar://details?id=ir.example.app')).toBe(true);
    });

    // The page itself, and everything it legitimately needs, must still load.
    it.each([
      'https://panel.example.ir/userarea',
      'https://panel.example.ir/assets/app.js',
      'https://panel.example.ir/api/login',
      'https://panel.example.ir/style.css',
      'https://panel.example.ir/logo.png',
    ])('lets %s through', (url) => {
      expect(isAppDownload(url)).toBe(false);
    });

    it('is not fooled by a query string that mentions an apk', () => {
      expect(isAppDownload('https://panel.example.ir/userarea?ref=app.apk')).toBe(false);
    });

    it('ignores something it cannot parse', () => {
      expect(isAppDownload('not a url')).toBe(false);
    });
  });
});
