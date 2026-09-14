/**
 * Which hosts the outbound proxy is for.
 *
 * The proxy is one process-wide setting (`PROXY_*`), but whether a given
 * provider needs it is a property of that provider: the Iranian ones are only
 * reachable through an egress inside Iran, and anything else is better off
 * going straight out. `useProxy` on the provider row is the declaration, made
 * when the provider is defined; this registry is how that declaration reaches
 * the agents, which only ever see a hostname.
 *
 * Routing by host rather than by provider is what lets a single shared
 * `HttpService` — injected into a dozen call sites — and the WebSocket path,
 * which never goes through axios at all, honour the same flag with no change
 * at any call site.
 */

const routes = new Map<string, boolean>();

/** Reads the host out of a URL, or out of something that is already a host. */
export function hostFromUrl(url: string): string {
  if (!url) return '';
  const clean = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const slash = clean.indexOf('/');
  const authority = slash === -1 ? clean : clean.slice(0, slash);
  const at = authority.lastIndexOf('@');
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  const colons = hostPort.split(':');
  const host = colons.length > 2 ? colons.slice(0, colons.length - 1).join(':') : colons[0];
  return host.toLowerCase();
}

/**
 * Declares how one host is reached.
 *
 * Two providers sharing a host that disagree about the proxy cannot both be
 * satisfied, and there is no safe direction to guess: a provider that needs the
 * proxy and does not get it simply cannot connect, while one that takes the
 * proxy it did not need still reaches its destination. So the proxy wins, and
 * the conflict is reported rather than silently resolved.
 */
export function registerProxyRoute(
  urlOrHost: string,
  useProxy: boolean,
  onConflict?: (message: string) => void,
): void {
  const host = hostFromUrl(urlOrHost);
  if (!host) return;

  const existing = routes.get(host);
  if (existing !== undefined && existing !== useProxy) {
    onConflict?.(
      `Host ${host} is claimed by providers that disagree about the proxy; routing it through the proxy`,
    );
    routes.set(host, true);
    return;
  }
  routes.set(host, useProxy);
}

/** What was declared for this host, or undefined if nothing was. */
export function lookupProxyRoute(host: string): boolean | undefined {
  return routes.get(host.toLowerCase());
}

/**
 * Drops every declaration. Providers re-register on each sync, so this is how a
 * host stops being routed once the provider that claimed it is gone.
 */
export function clearProxyRoutes(): void {
  routes.clear();
}
