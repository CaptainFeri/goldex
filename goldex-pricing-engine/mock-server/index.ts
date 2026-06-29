import * as http from 'http';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { config, applyConfig, MockConfig } from './config';
import { ShopState, Quote } from './catalog';
import * as zaryar from './zaryar';
import * as talaab from './talaab';

type Category = 'zaryar' | 'talaab';

interface Client {
  ws: WebSocket;
  category: Category;
  shop: string;
  shopKey: string;
}

const shops = new Map<string, ShopState>();
const clients = new Set<Client>();

// ── Mock order book ───────────────────────────────────────────────────────────
// Orders placed via SubmitDeal / trades-molten. Each is assigned a terminal
// status at placement time (1 = success, 2 = fail) based on orderSuccessRate;
// the engine polls the list endpoints and observes that status ~5s later.
interface MockOrder {
  id: string;
  category: Category;
  shop: string;
  terminalStatus: number; // 1 = success, 2 = fail (revealed after resolveAt)
  resolveAt: number; // epoch ms when the order resolves
}
const mockOrders = new Map<string, MockOrder>();
let talaabSeq = 1000;

function decideStatus(): number {
  return Math.random() < config.orderSuccessRate ? 1 : 2;
}

function placeOrder(category: Category, shop: string, id: string): MockOrder {
  const order: MockOrder = {
    id,
    category,
    shop,
    terminalStatus: decideStatus(),
    resolveAt: Date.now() + config.orderResolveMs,
  };
  mockOrders.set(id, order);
  return order;
}

// 0 (pending) until resolveAt elapses, then the decided terminal status. This
// gives the engine ~orderResolveMs of "pending" before it sees the outcome.
function effectiveStatus(o: MockOrder): number {
  return Date.now() >= o.resolveAt ? o.terminalStatus : 0;
}

function ordersFor(category: Category, shop: string): { id: string; status: number }[] {
  return [...mockOrders.values()]
    .filter((o) => o.category === category && o.shop === shop)
    .map((o) => ({ id: o.id, status: effectiveStatus(o) }));
}

function shopKey(category: Category, shop: string): string {
  return `${category}:${shop}`;
}

function getShop(category: Category, shop: string): ShopState {
  const key = shopKey(category, shop);
  let state = shops.get(key);
  if (!state) {
    state = new ShopState(shop);
    shops.set(key, state);
    log(`registered shop ${key}`);
  }
  return state;
}

function log(msg: string): void {
  console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${msg}`);
}

// ── HTTP helpers ────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(data));
  });
}

async function sendJson(res: http.ServerResponse, body: unknown, status = 200): Promise<void> {
  if (config.latencyMs > 0) await new Promise((r) => setTimeout(r, config.latencyMs));
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(payload);
}

// ── Price push ──────────────────────────────────────────────────────────────

function quotesByShop(): Map<string, Quote[]> {
  const map = new Map<string, Quote[]>();
  for (const [key, state] of shops) map.set(key, state.quotes());
  return map;
}

function pushUpdates(filter?: (c: Client) => boolean): void {
  const quoteCache = new Map<string, Quote[]>();
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (filter && !filter(client)) continue;
    let quotes = quoteCache.get(client.shopKey);
    if (!quotes) {
      quotes = getShop(client.category, client.shop).quotes();
      quoteCache.set(client.shopKey, quotes);
    }
    const frame =
      client.category === 'zaryar'
        ? JSON.stringify(zaryar.buildMazanePush(quotes))
        : talaab.buildPricingPush(quotes);
    client.ws.send(frame);
  }
}

let tickTimer: NodeJS.Timeout | null = null;
function scheduleTick(): void {
  tickTimer = setTimeout(() => {
    for (const state of shops.values()) state.tick();
    pushUpdates();
    scheduleTick(); // reschedule to honour runtime tickMs changes
  }, config.tickMs);
}

// ── WebSocket ───────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

function matchWsRoute(pathname: string): { category: Category; shop: string } | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 4 && parts[0] === 'zaryar' && parts[2] === 'signalr' && parts[3] === 'connect') {
    return { category: 'zaryar', shop: parts[1] };
  }
  if (parts.length >= 3 && parts[0] === 'talaab' && parts[2] === 'app') {
    return { category: 'talaab', shop: parts[1] };
  }
  return null;
}

function onWsConnect(ws: WebSocket, route: { category: Category; shop: string }): void {
  getShop(route.category, route.shop); // ensure state exists
  const client: Client = {
    ws,
    category: route.category,
    shop: route.shop,
    shopKey: shopKey(route.category, route.shop),
  };
  clients.add(client);
  log(`ws connect ${client.shopKey} (clients: ${clients.size})`);

  if (route.category === 'zaryar') {
    ws.send(zaryar.ZARYAR_INIT_FRAME);
  } else {
    // Pusher handshake must arrive first so the engine can grab a socket_id.
    ws.send(talaab.buildConnectionEstablished());
  }

  ws.on('message', (raw) => {
    if (route.category !== 'talaab') return;
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'pusher:ping') ws.send(talaab.buildPong());
    } catch {
      // ignore malformed client frames
    }
  });

  ws.on('close', () => {
    clients.delete(client);
    log(`ws close ${client.shopKey} (clients: ${clients.size})`);
  });
  ws.on('error', () => clients.delete(client));
}

// ── Control API ─────────────────────────────────────────────────────────────

async function handleControl(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  parts: string[],
  query: URLSearchParams,
): Promise<void> {
  const action = parts[1];

  if (req.method === 'GET' && action === 'health') {
    return sendJson(res, {
      ok: true,
      config,
      shops: [...shops.keys()],
      clients: clients.size,
    });
  }

  if (req.method === 'POST' && action === 'config') {
    const body = await readBody(req);
    const patch = body ? (JSON.parse(body) as Partial<MockConfig>) : {};
    const updated = applyConfig(patch);
    log(`config updated: ${JSON.stringify(patch)}`);
    return sendJson(res, { ok: true, config: updated });
  }

  if (req.method === 'POST' && action === 'disconnect') {
    const category = query.get('category');
    const shop = query.get('shop');
    let dropped = 0;
    for (const client of clients) {
      if (category && client.category !== category) continue;
      if (shop && client.shop !== shop) continue;
      client.ws.close();
      dropped++;
    }
    log(`force-disconnected ${dropped} client(s)`);
    return sendJson(res, { ok: true, dropped });
  }

  if (req.method === 'POST' && action === 'burst') {
    const category = query.get('category');
    const shop = query.get('shop');
    const count = Math.max(1, Number(query.get('count') ?? 10));
    const match = (c: Client) =>
      (!category || c.category === category) && (!shop || c.shop === shop);
    for (let i = 0; i < count; i++) {
      for (const state of shops.values()) state.tick();
      pushUpdates(match);
    }
    log(`burst of ${count} pushed`);
    return sendJson(res, { ok: true, count });
  }

  return sendJson(res, { ok: false, error: 'unknown control action' }, 404);
}

// ── HTTP routing ─────────────────────────────────────────────────────────────

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  try {
    if (parts[0] === '__mock') {
      return await handleControl(req, res, parts, url.searchParams);
    }

    const category = parts[0] as Category;
    const shop = parts[1];

    if ((category === 'zaryar' || category === 'talaab') && shop) {
      const rest = '/' + parts.slice(2).join('/');
      const state = getShop(category, shop);

      if (category === 'zaryar') {
        if (method === 'GET' && rest === '/signalr/negotiate') {
          return await sendJson(res, zaryar.buildNegotiate());
        }
        if (method === 'GET' && rest === '/signalr/start') {
          return await sendJson(res, zaryar.buildStart());
        }
        if (method === 'POST' && rest === '/api/Home/ShopkeeperItemsList') {
          await readBody(req);
          return await sendJson(res, zaryar.buildItemsList(state.quotes()));
        }
        if (method === 'POST' && rest === '/api/Home/GetDealView') {
          const body = await readBody(req);
          const itemId = body ? Number(JSON.parse(body).itemId) : 0;
          return await sendJson(res, zaryar.buildDealView(itemId, state.quotes()));
        }
        if (method === 'POST' && rest === '/api/Home/SubmitDeal') {
          await readBody(req);
          const orderId = randomUUID();
          const order = placeOrder(category, shop, orderId);
          log(
            `zaryar order ${orderId} accepted → resolves ${order.terminalStatus === 1 ? 'SUCCESS' : 'FAIL'} in ${config.orderResolveMs}ms`,
          );
          return await sendJson(res, zaryar.buildSubmitDeal(orderId));
        }
        if (method === 'POST' && rest === '/api/Deal/DealsList') {
          await readBody(req);
          return await sendJson(res, zaryar.buildDealsList(ordersFor(category, shop)));
        }
        if (method === 'GET' && rest === '/api/Profile/GetProfile') {
          return await sendJson(res, zaryar.buildProfile(shop));
        }
        if (method === 'POST' && rest === '/api/User/SendConfirmCode') {
          await readBody(req);
          return await sendJson(res, { IsSuccess: true, Message: 'OTP sent' });
        }
        if (method === 'POST' && (rest === '/auth/verifyCode' || rest === '/api/User/VerifyCode')) {
          await readBody(req);
          return await sendJson(res, zaryar.buildVerifyOtp(shop));
        }
      }

      if (category === 'talaab') {
        if (method === 'GET' && (rest === '/homepage' || rest === '/')) {
          return await sendJson(res, talaab.buildHomepage(state.quotes()));
        }
        if (method === 'POST' && rest === '/auth/check-mobile-exists') {
          await readBody(req);
          return await sendJson(res, talaab.buildSendOtp());
        }
        if (method === 'POST' && rest === '/auth/login') {
          await readBody(req);
          return await sendJson(res, talaab.buildVerifyOtp(shop));
        }
        if (method === 'POST' && rest === '/profile/trades/molten') {
          const body = await readBody(req);
          const parsed = body ? JSON.parse(body) : {};
          const count = Number(parsed.weight) || 0;
          const price = Number(parsed.current_price) || 0;
          const dealType = Number(parsed.trade_type) === 1 ? 0 : 1;
          const requestId = ++talaabSeq;
          const order = placeOrder(category, shop, String(requestId));
          log(
            `talaab order ${requestId} accepted → resolves ${order.terminalStatus === 1 ? 'SUCCESS' : 'FAIL'} in ${config.orderResolveMs}ms`,
          );
          return await sendJson(res, talaab.buildTrade(requestId, count, price, dealType));
        }
        if (method === 'GET' && rest === '/profile/application-latest-trades') {
          return await sendJson(res, talaab.buildLatestTrades(ordersFor(category, shop)));
        }
      }
    }

    return await sendJson(res, { ok: false, error: 'not found', path: url.pathname }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`request error: ${message}`);
    return sendJson(res, { ok: false, error: message }, 500);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = matchWsRoute(url.pathname);
  if (!route) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => onWsConnect(ws, route));
});

server.listen(config.port, () => {
  log(`Mock provider sandbox listening on http://localhost:${config.port}`);
  log(`  Zaryar baseUrl : http://localhost:${config.port}/zaryar/<shop>/signalr`);
  log(`  Zaryar apiBase : http://localhost:${config.port}/zaryar/<shop>`);
  log(`  TalaAb baseUrl : ws://localhost:${config.port}/talaab/<shop>/app/app-key`);
  log(`  TalaAb apiBase : http://localhost:${config.port}/talaab/<shop>/homepage`);
  log(`  Control        : http://localhost:${config.port}/__mock/health`);
  scheduleTick();
});

function shutdown(): void {
  log('shutting down');
  if (tickTimer) clearTimeout(tickTimer);
  for (const client of clients) client.ws.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
