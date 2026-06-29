// Mutable runtime config for the sandbox. Defaults come from env vars; the
// control API (POST /__mock/config) can change most of them at runtime so you
// can drive stress-test scenarios without restarting.

export interface MockConfig {
  port: number;
  /** How often prices move and get pushed to connected sockets. */
  tickMs: number;
  /** Max fractional price move per tick (random walk), e.g. 0.003 = ±0.3%. */
  jitterPct: number;
  /** Half of the buy/sell spread as a fraction of mid price. */
  halfSpreadPct: number;
  /** When false, shops report "closed" and quotes are not dealable. */
  shopOpen: boolean;
  /** Artificial latency added to every HTTP response (ms). */
  latencyMs: number;
  /** Extra synthetic coin items added to the catalog (for load testing). */
  extraItems: number;
  /** Probability (0..1) that a placed order resolves as SUCCESS vs FAIL. */
  orderSuccessRate: number;
  /** How long an order stays pending before it resolves (ms), to mimic a real desk. */
  orderResolveMs: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export const config: MockConfig = {
  port: num('MOCK_PORT', 5000),
  tickMs: num('MOCK_TICK_MS', 1000),
  jitterPct: num('MOCK_JITTER_PCT', 0.003),
  halfSpreadPct: num('MOCK_HALF_SPREAD_PCT', 0.003),
  shopOpen: bool('MOCK_SHOP_OPEN', true),
  latencyMs: num('MOCK_LATENCY_MS', 0),
  extraItems: num('MOCK_EXTRA_ITEMS', 0),
  orderSuccessRate: num('MOCK_ORDER_SUCCESS_RATE', 0.5),
  orderResolveMs: num('MOCK_ORDER_RESOLVE_MS', 20000),
};

export function applyConfig(patch: Partial<MockConfig>): MockConfig {
  for (const key of Object.keys(patch) as (keyof MockConfig)[]) {
    const value = patch[key];
    if (value === undefined || key === 'port') continue;
    (config[key] as number | boolean) = value as number | boolean;
  }
  return config;
}
