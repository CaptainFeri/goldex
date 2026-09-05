# Provider Mock / Stress-Test Sandbox

A standalone server that imitates the **Zaryar (SignalR)** and **TalaAb (Pusher)**
upstreams with the exact request/response and WebSocket frame shapes the pricing
engine expects. Point providers at it to run the engine against fake markets and
exercise stress / failure scenarios — no real credentials or upstreams needed.

It uses only Node's `http` + the `ws` package (already a dependency).

## Run

### Locally

```bash
npm run mock
```

### With Docker Compose (alongside the engine)

The mock is a service in `docker-compose.dev.yml` on the same network as the app.
The app sets `MOCK_HOST=mock`, so the seed migrations point providers at
`http://mock:5000` automatically.

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

The mock is also published on the host (`MOCK_EXTERNAL_PORT`, default 5000), so
you can still hit its control API from your machine at `http://localhost:5000`.

> Already ran the stack before this change? Migration
> `1700000000007-RepointMockProviders` rewrites the previously-seeded `localhost`
> provider URLs to `mock:5000` on the next boot — no manual DB edits needed.

Configure via env vars:

| Env var | Default | Meaning |
|---|---|---|
| `MOCK_PORT` | `5000` | Listen port |
| `MOCK_TICK_MS` | `1000` | Price move + push interval |
| `MOCK_JITTER_PCT` | `0.003` | Max per-tick random price move (±0.3%) |
| `MOCK_HALF_SPREAD_PCT` | `0.003` | Half the buy/sell spread |
| `MOCK_SHOP_OPEN` | `true` | Whether shops report open / quotes dealable |
| `MOCK_LATENCY_MS` | `0` | Artificial latency on every HTTP response |
| `MOCK_EXTRA_ITEMS` | `0` | Extra synthetic coin items (catalog size for load tests) |

```bash
MOCK_PORT=5000 MOCK_TICK_MS=200 MOCK_EXTRA_ITEMS=200 npm run mock
```

## URL scheme

`<shop>` is any string — each distinct value is an independent shop with its own
prices (so two shops of the same category produce arbitrage opportunities).

| Category | Field | URL |
|---|---|---|
| Zaryar | `baseUrl` | `http://localhost:5000/zaryar/<shop>/signalr` |
| Zaryar | `apiBaseUrl` | `http://localhost:5000/zaryar/<shop>` |
| TalaAb | `baseUrl` | `ws://localhost:5000/talaab/<shop>/app/app-key?protocol=7&client=js&version=8.4.0` |
| TalaAb | `apiBaseUrl` | `http://localhost:5000/talaab/<shop>/homepage` |

## Register mock providers in the engine

### Option A — seed migration (recommended)

The migration `1700000000006-SeedMockProviders` inserts three sandbox providers
(`mock-zaryar-a` → shopA, `mock-zaryar-b` → shopB, `mock-talaab-a` → afrogh)
pointing at the mock. Migrations run automatically on engine start, so just boot
the engine — the providers appear and (being active) auto-connect once the mock
is running.

URLs are built from `MOCK_PORT` (default `5000`), so run the engine with the same
port you ran the mock on. Env overrides:

| Env var | Default | Effect |
|---|---|---|
| `MOCK_PORT` | `5000` | Host port baked into the seeded URLs |
| `MOCK_SEED_ACTIVE` | `true` | Set `false` to seed them inactive |

Start `npm run mock` **before** (or alongside) the engine so the providers
connect on the first health-check pass. To remove them, revert the migration or
deactivate via `PATCH /providers/:id`.

### Option B — manual via API

With the engine running (default `:3000`), create providers pointing at the mock.
Any auth values work — the mock accepts everything. Set `active: true` to start
immediately (skips the OTP flow).

```bash
# Two Zaryar shops (different prices → arbitrage between them)
curl -X POST http://localhost:3000/providers -H 'Content-Type: application/json' -d '{
  "key":"mock-zaryar-a","category":"zaryar",
  "baseUrl":"http://localhost:5000/zaryar/shopA/signalr",
  "apiBaseUrl":"http://localhost:5000/zaryar/shopA",
  "phone":"09120000000",
  "auth":{"token":"t","sessionId":"s","shopkeeperId":"shopA","uId":"u","roleType":"0"},
  "active":true
}'

curl -X POST http://localhost:3000/providers -H 'Content-Type: application/json' -d '{
  "key":"mock-zaryar-b","category":"zaryar",
  "baseUrl":"http://localhost:5000/zaryar/shopB/signalr",
  "apiBaseUrl":"http://localhost:5000/zaryar/shopB",
  "phone":"09120000000",
  "auth":{"token":"t","sessionId":"s","shopkeeperId":"shopB","uId":"u","roleType":"0"},
  "active":true
}'

# A TalaAb shop
curl -X POST http://localhost:3000/providers -H 'Content-Type: application/json' -d '{
  "key":"mock-talaab-a","category":"talaab",
  "baseUrl":"ws://localhost:5000/talaab/afrogh/app/app-key?protocol=7&client=js&version=8.4.0",
  "apiBaseUrl":"http://localhost:5000/talaab/afrogh/homepage",
  "phone":"09120000000",
  "auth":{"token":"t","apiBaseUrl":"http://localhost:5000/talaab/afrogh/homepage"},
  "active":true
}'
```

Then watch the engine: `GET /providers/health`, `GET /providers/best-prices`,
`GET /arbitrage`, `POST /arbitrage/scan`.

> If you prefer to exercise the OTP flow too, set `sendOtpUrl` /
> `verifyCodeUrl` to the mock (`.../zaryar/<shop>/api/User/SendConfirmCode` and
> `.../zaryar/<shop>/auth/verifyCode`, or the TalaAb `.../auth/check-mobile-exists`
> and `.../auth/login`) and leave `active:false`, then call the engine's
> `send-otp` / `verify-otp` endpoints with any code.

## Scenario control API

Drive failure / load scenarios at runtime without restarting:

```bash
# Inspect state
curl http://localhost:5000/__mock/health

# Speed up to 50ms ticks and widen volatility (stress the ingest path)
curl -X POST http://localhost:5000/__mock/config -H 'Content-Type: application/json' \
  -d '{"tickMs":50,"jitterPct":0.02}'

# Close all shops (engine's waitForShopOpen / "closed" handling)
curl -X POST http://localhost:5000/__mock/config -d '{"shopOpen":false}'

# Inject 500ms latency on every HTTP response (slow upstream)
curl -X POST http://localhost:5000/__mock/config -d '{"latencyMs":500}'

# Force-drop sockets to test reconnection / health-check recovery
curl -X POST 'http://localhost:5000/__mock/disconnect'                       # all
curl -X POST 'http://localhost:5000/__mock/disconnect?category=zaryar'       # one category
curl -X POST 'http://localhost:5000/__mock/disconnect?shop=shopA'            # one shop

# Fire a burst of immediate price updates (spike load)
curl -X POST 'http://localhost:5000/__mock/burst?count=500'
curl -X POST 'http://localhost:5000/__mock/burst?shop=shopA&count=100'
```

## Catalog

Shared catalog (same item ids across shops so prices are comparable):

- **Coins** (`groupId 2`): سکه امامی (101), بهار آزادی (102), نیم (103), ربع (104), گرمی (105)
- **Molten / آبشده** (`groupId 1`): آبشده نقدی (201), طلای ۱۸ عیار (202)
- **Silver / نقره** (`groupId 3`): نقره ۹۹۹ (25), شمش نقره (28)

Silver uses ids 25 & 28 because the TalaAb provider special-cases those (no
×1000 scaling). `MOCK_EXTRA_ITEMS` appends synthetic coin items (ids from 1000).
