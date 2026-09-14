import {
  clearProxyRoutes,
  hostFromUrl,
  lookupProxyRoute,
  registerProxyRoute,
} from './proxy-route.registry';
import { isProxyBypassHost, shouldProxyHost } from './proxy.config';

describe('proxy routing', () => {
  beforeEach(() => clearProxyRoutes());

  describe('reading the host', () => {
    it('takes it out of a url', () => {
      expect(hostFromUrl('https://pnlapi.example.ir/signalr')).toBe('pnlapi.example.ir');
    });

    it('drops the port', () => {
      expect(hostFromUrl('http://example.ir:8080/api')).toBe('example.ir');
    });

    it('drops credentials', () => {
      expect(hostFromUrl('https://user:pass@example.ir/x')).toBe('example.ir');
    });

    it('reads a websocket url', () => {
      expect(hostFromUrl('wss://socket.example.ir/ws')).toBe('socket.example.ir');
    });

    it('normalises case, so a declaration matches the request', () => {
      expect(hostFromUrl('https://Example.IR/x')).toBe('example.ir');
    });

    it('accepts something that is already a host', () => {
      expect(hostFromUrl('example.ir')).toBe('example.ir');
    });
  });

  describe('the decision', () => {
    /**
     * The bypass rules are about the network the engine itself is on, not about
     * any provider: the squid proxy only tunnels CONNECT to :443 and cannot
     * reach an internal `mock:5000`. No provider flag may override that.
     */
    it('never proxies an internal host, whatever a provider declared', () => {
      registerProxyRoute('mock', true);
      registerProxyRoute('10.0.0.5', true);
      expect(shouldProxyHost('mock')).toBe(false);
      expect(shouldProxyHost('10.0.0.5')).toBe(false);
      expect(isProxyBypassHost('localhost')).toBe(true);
    });

    it('follows a provider that declared it needs the proxy', () => {
      registerProxyRoute('https://pnlapi.example.ir/signalr', true);
      expect(shouldProxyHost('pnlapi.example.ir')).toBe(true);
    });

    it('goes direct for a provider that declared it does not', () => {
      registerProxyRoute('https://global.example.com/api', false);
      expect(shouldProxyHost('global.example.com')).toBe(false);
    });

    /**
     * An undeclared public host keeps the behaviour that predates the flag —
     * with a proxy configured, everything outside the bypass rules was
     * tunnelled — so nothing changes route merely because it is not registered
     * yet, such as during the window before the first route sync.
     */
    it('proxies an undeclared public host, as before the flag existed', () => {
      expect(shouldProxyHost('unknown.example.ir')).toBe(true);
    });

    it('matches a declaration case-insensitively', () => {
      registerProxyRoute('https://Example.IR', false);
      expect(shouldProxyHost('EXAMPLE.ir')).toBe(false);
    });
  });

  describe('two providers, one host', () => {
    // There is no safe way to split the difference: a provider that needs the
    // proxy and does not get it cannot connect at all, while one that takes a
    // proxy it did not need still reaches its destination.
    it('routes through the proxy and reports the conflict', () => {
      const warn = jest.fn();
      registerProxyRoute('https://shared.example.ir/a', false, warn);
      registerProxyRoute('https://shared.example.ir/b', true, warn);
      expect(shouldProxyHost('shared.example.ir')).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('shared.example.ir');
    });

    it('reports it whichever order the two arrive in', () => {
      const warn = jest.fn();
      registerProxyRoute('https://shared.example.ir/a', true, warn);
      registerProxyRoute('https://shared.example.ir/b', false, warn);
      expect(shouldProxyHost('shared.example.ir')).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('stays quiet when they agree', () => {
      const warn = jest.fn();
      registerProxyRoute('https://shared.example.ir/a', false, warn);
      registerProxyRoute('https://shared.example.ir/b', false, warn);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('rebuilding', () => {
    // Routes are rebuilt rather than patched on every sync, so a host a
    // provider no longer talks to stops being declared instead of keeping its
    // old routing forever.
    it('forgets a host once it is no longer claimed', () => {
      registerProxyRoute('https://old.example.com', false);
      expect(lookupProxyRoute('old.example.com')).toBe(false);
      clearProxyRoutes();
      expect(lookupProxyRoute('old.example.com')).toBeUndefined();
      expect(shouldProxyHost('old.example.com')).toBe(true);
    });

    it('ignores an empty url rather than declaring a blank host', () => {
      registerProxyRoute('', false);
      expect(lookupProxyRoute('')).toBeUndefined();
    });
  });
});
