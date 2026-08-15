import { ConfigService } from "@nestjs/config";

/**
 * Builds the axios `proxy` option (HTTP CONNECT) from app config so that
 * outbound calls to Iranian payment gateways (kaino, shahin) are tunnelled
 * through the Iranian egress proxy. Returns an empty object when no proxy is
 * configured, keeping the local/dev behaviour unchanged.
 */
export function buildHttpProxyConfig(config: ConfigService): Record<string, any> {
  const proxy = config.get<Record<string, any>>("app", { infer: true })?.proxy ?? {};
  return buildHttpProxyConfigFrom(proxy);
}

/**
 * Builds an axios `proxy` option from an arbitrary proxy object
 * ({ host, port, username, password }). Returns an empty object when no
 * host is set, keeping direct (no-proxy) behaviour for that caller.
 */
export function buildHttpProxyConfigFrom(proxy: Record<string, any> | undefined): Record<string, any> {
  const host = proxy?.host?.trim();
  if (!host) {
    return {};
  }
  const proxyConfig: Record<string, any> = {
    proxy: {
      protocol: "http",
      host,
      port: Number(proxy.port ?? 29180),
    },
  };
  if (proxy.username) {
    proxyConfig.proxy.auth = {
      username: proxy.username,
      password: proxy.password ?? "",
    };
  }
  return proxyConfig;
}