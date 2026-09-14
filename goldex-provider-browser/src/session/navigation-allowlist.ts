/**
 * What the remote-controlled browser is allowed to reach.
 *
 * This browser runs inside the server network and is driven by whoever is
 * looking at the stream. Without a limit on where it may go, it is a request
 * forgery tool with a human at the controls: postgres, redis, rabbitmq and
 * every other internal service are a URL bar away. So navigation is closed by
 * default and opened only to the provider being activated.
 *
 * Two independent rules, and a request must pass both:
 *
 *  1. It may not address the internal network. This holds even if a provider's
 *     own URL somehow resolves there, because that is the rule protecting the
 *     things this browser must never reach.
 *  2. Its host must belong to the provider — one of the hosts configured on it,
 *     or a subdomain of one.
 */

/** A host that must never be reachable, whatever any provider claims. */
export function isInternalHost(host: string): boolean {
  const h = host.toLowerCase().trim();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (h === '[::1]' || h === '::1') return true;

  // A single-label name is a container on this docker network: `postgres`,
  // `redis`, `rabbitmq`, `goldex-backend`. Public hosts always have a dot.
  if (!h.includes('.')) return true;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, and the cloud metadata endpoint
    if (a >= 224) return true;
  }
  return false;
}

/** The host part of a URL, lowercased, without port or credentials. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Builds the set of hosts a provider legitimately answers on, from the URLs it
 * was configured with. Nothing is inferred beyond those — a provider that
 * serves its login from a host nobody recorded is a configuration gap to fix
 * on the provider, not something to guess at here.
 */
export function allowedHostsFor(urls: (string | undefined | null)[]): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const host = hostOf(url);
    if (host && !isInternalHost(host)) hosts.add(host);
  }
  return [...hosts];
}

/**
 * Whether a request the page made may proceed.
 *
 * Subdomains of an allowed host pass, because a provider's login page routinely
 * pulls its own assets from one. The match is on a label boundary: `evil.ir` is
 * not a subdomain of `ir`, and `notexample.ir` is not a subdomain of
 * `example.ir`.
 */
export function isNavigationAllowed(url: string, allowedHosts: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // data: and blob: never leave the page; about:blank is the starting page.
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return true;
  if (url === 'about:blank') return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();
  if (isInternalHost(host)) return false;

  return allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}
