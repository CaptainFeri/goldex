import * as http from 'http';
import * as https from 'https';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'http';

/**
 * Outbound HTTP(S) proxy used to reach Iranian gold providers (talaab,
 * zaryar) from an egress outside Iran. Empty PROXY_HOST disables the proxy.
 */
export interface ProxyOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function readProxyOptions(): ProxyOptions | null {
  const host = process.env.PROXY_HOST?.trim();
  if (!host) {
    return null;
  }
  return {
    host,
    port: Number(process.env.PROXY_PORT ?? '29180'),
    username: process.env.PROXY_USERNAME?.trim() || undefined,
    password: process.env.PROXY_PASSWORD || undefined,
  };
}

function proxyAuth(proxy: ProxyOptions): string | undefined {
  if (!proxy.username) return undefined;
  return `${proxy.username}:${proxy.password ?? ''}`;
}

/**
 * True when the host should bypass the proxy. This covers loopback, private
 * ranges, and docker-internal container names (single-label hostnames such as
 * `mock`, `goldex-pricing-engine-mock`, `redis`). Iranian providers are public
 * dotted domains and remain proxied; local/dev/mock traffic must NOT be routed
 * through the Iran squid proxy, which cannot reach internal hostnames/ports.
 */
export function isProxyBypassHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h || h === 'localhost') return true;
  // Single-label hostnames are docker network names on the same host — no dot.
  if (!h.includes('.')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map((n) => Number(n));
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function hostFromUrl(url: string): string {
  const clean = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const slash = clean.indexOf('/');
  const authority = slash === -1 ? clean : clean.slice(0, slash);
  const at = authority.lastIndexOf('@');
  const hostPort = at === -1 ? authority : authority.slice(at + 1);
  const colons = hostPort.split(':');
  return colons.length > 2 ? colons.slice(0, colons.length - 1).join(':') : colons[0];
}

/**
 * An agent that routes each connection either through the configured proxy (for
 * public Iranian providers) or directly (for loopback / docker `mock` / private
 * hosts). This keeps mock & local traffic off the Iran squid proxy, which only
 * tunnels HTTPS CONNECT to :443 and cannot reach internal `mock:5000` (hence the
 * spurious 503 the engine surfaced).
 */
class RoutingHttpAgent extends http.Agent {
  private readonly proxyAgent: HttpProxyAgent<string>;
  private readonly directAgent: http.Agent;
  constructor(proxyUrl: string, auth?: { auth: string }) {
    super();
    this.directAgent = new http.Agent();
    this.proxyAgent = new HttpProxyAgent<string>(proxyUrl, auth as any);
  }
  addRequest(req: any, options: any): void {
    const host = String(options.hostname ?? options.host ?? '');
    if (isProxyBypassHost(host)) (this.directAgent as any).addRequest(req, options);
    else (this.proxyAgent as any).addRequest(req, options);
  }
}

class RoutingHttpsAgent extends https.Agent {
  private readonly proxyAgent: HttpsProxyAgent<string>;
  private readonly directAgent: https.Agent;
  constructor(proxyUrl: string, auth?: { auth: string }) {
    super();
    this.directAgent = new https.Agent();
    this.proxyAgent = new HttpsProxyAgent<string>(proxyUrl, auth as any);
  }
  addRequest(req: any, options: any): void {
    const host = String(options.hostname ?? options.host ?? '');
    if (isProxyBypassHost(host)) (this.directAgent as any).addRequest(req, options);
    else (this.proxyAgent as any).addRequest(req, options);
  }
}

/**
 * Builds the axios connection config. Returns an empty object when no proxy is
 * configured. Otherwise returns routing agents that bypass the proxy for
 * loopback / mock / private hosts and proxy everything else.
 */
export function buildHttpProxyConfig(): Record<string, any> {
  const proxy = readProxyOptions();
  if (!proxy) {
    return {};
  }
  const auth = proxyAuth(proxy);
  const opts = auth ? { auth } : undefined;
  const proxyUrl = `http://${proxy.host}:${proxy.port}`;
  return {
    httpAgent: new RoutingHttpAgent(proxyUrl, opts),
    httpsAgent: new RoutingHttpsAgent(proxyUrl, opts),
  };
}

/**
 * Builds an HTTP(S) CONNECT agent suitable for `ws` connections through the
 * configured proxy. Returns undefined when no proxy is configured, or when the
 * target host is a proxy-bypass host (loopback / mock / private).
 */
export function buildWebSocketAgent(url: string): Agent | undefined {
  const proxy = readProxyOptions();
  if (!proxy) {
    return undefined;
  }
  if (isProxyBypassHost(hostFromUrl(url))) {
    return undefined;
  }
  const auth = proxyAuth(proxy);
  const secure = url.startsWith('wss') || url.startsWith('https');
  const proxyUrl = `http://${proxy.host}:${proxy.port}`;
  const opts = auth ? { auth } : undefined;
  return secure
    ? new HttpsProxyAgent(proxyUrl, opts as any)
    : new HttpProxyAgent(proxyUrl, opts as any);
}