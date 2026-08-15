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
 * Builds the axios `proxy` option (HTTP CONNECT). Returns an empty object when
 * no proxy is configured, keeping local/dev behaviour unchanged.
 */
export function buildHttpProxyConfig(): Record<string, any> {
  const proxy = readProxyOptions();
  if (!proxy) {
    return {};
  }
  const proxyConfig: Record<string, any> = {
    proxy: {
      protocol: 'http',
      host: proxy.host,
      port: proxy.port,
    },
  };
  const auth = proxyAuth(proxy);
  if (auth) {
    const [username, password] = auth.split(':');
    proxyConfig.proxy.auth = { username, password };
  }
  return proxyConfig;
}

/**
 * Builds an HTTP(S) CONNECT agent suitable for `ws` connections through the
 * configured proxy. Returns undefined when no proxy is configured.
 */
export function buildWebSocketAgent(url: string): Agent | undefined {
  const proxy = readProxyOptions();
  if (!proxy) {
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