# Message Brokers

The application publishes messages to two brokers: **Redis Pub/Sub** and **RabbitMQ**.

---

## 1. Redis Pub/Sub

### Connection
| Property | Value |
|---|---|
| Host | `REDIS_HOST` (default `localhost`) |
| Port | `REDIS_PORT` (default `6379`) |
| Password | `REDIS_PASSWORD` |

### Channel

**`price:updates`** — emitted on every price tick from any provider.

**`arbitrage:updates`** — emitted on every arbitrage scan (`ArbitrageScanResult`: `signals`, `trigger`, `totalProviders`, `totalItems`, `opportunityCount`, `bestProfitToman`, `scannedAt`).

#### Data format (JSON)

```jsonc
{
  "itemId": 101,
  "buyPrice": 185720000,
  "sellPrice": 184980000,
  "buyPriceStr": "۱۸۵,۷۲۰,۰۰۰ تومان",
  "sellPriceStr": "۱۸۴,۹۸۰,۰۰۰ تومان",
  "canBuy": true,
  "canSell": true,
  "buyRange": 5,
  "sellRange": 5,
  "maxBuyCount": 10,
  "maxSellCount": 10,
  "spread": 74000,
  "spreadPercent": 0.04,
  "updatedTimeStr": "۱۴:۳۰:۲۵",
  "timestamp": "2026-06-20T11:00:00.000Z",
  "itemName": "سکه امامی",
  "unit": "عدد",
  "groupId": 2,
  "groupName": "مسکوکات",
  "providerKey": "mirrokni",
  "buyPricePerGram": null,          // only for groupId === 1 (گرم)
  "sellPricePerGram": null,
  "buyPricePerGramStr": null,
  "sellPricePerGramStr": null
}
```

---

## 2. RabbitMQ

### Connection
| Property | Value |
|---|---|
| URL | `RABBITMQ_URL` (default `amqp://localhost:5672`) |
| Host | `RABBITMQ_HOST` (default `localhost`) |
| Port | `RABBITMQ_PORT` (default `5672`) |

### Topology

| Resource | Name |
|---|---|
| Exchange | `signalr.providers` |
| Exchange type | `topic` |
| Queue | `signalr.providers.queue` |

#### Routing key convention

```
<domain>[.<providerKey>].<action>
```

When a `providerKey` is present it is inserted as the second segment:
- `price.mirrokni.update`
- `provider.arianatala.created`

### Envelope

Every message published to RabbitMQ uses this JSON envelope:

```jsonc
{
  "pattern": "price.update",      // message pattern name
  "data": { ... },                // payload (varies by pattern)
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"       // optional, scoped to a provider
}
```

---

### Message Patterns

#### `price.update`

Published in `BaseRealtimeProvider.emitPriceUpdate()` on every live price tick from any connected provider.

**Routing key:** `price.<providerKey>.update`

**Data:** Full `PriceData` object (same shape as Redis Pub/Sub above).

```jsonc
{
  "pattern": "price.update",
  "data": {
    "itemId": 101,
    "buyPrice": 185720000,
    "sellPrice": 184980000,
    "buyPriceStr": "۱۸۵,۷۲۰,۰۰۰ تومان",
    "sellPriceStr": "۱۸۴,۹۸۰,۰۰۰ تومان",
    "canBuy": true,
    "canSell": true,
    "buyRange": 5,
    "sellRange": 5,
    "maxBuyCount": 10,
    "maxSellCount": 10,
    "spread": 74000,
    "spreadPercent": 0.04,
    "updatedTimeStr": "۱۴:۳۰:۲۵",
    "timestamp": "2026-06-20T11:00:00.000Z",
    "itemName": "سکه امامی",
    "unit": "عدد",
    "groupId": 2,
    "groupName": "مسکوکات",
    "providerKey": "mirrokni",
    "buyPricePerGram": null,
    "sellPricePerGram": null,
    "buyPricePerGramStr": null,
    "sellPricePerGramStr": null
  },
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"
}
```

---

#### `provider.created`

Published in `ProviderService.create()` when a new provider is persisted.

**Routing key:** `provider.<key>.created`

**Data:** Full `ProviderEntity` object.

```jsonc
{
  "pattern": "provider.created",
  "data": {
    "id": "2b676dad-f0dc-4dd0-82dd-954087fdef6f",
    "key": "mirrokni",
    "category": "zaryar",
    "baseUrl": "https://pnlapi.mirrokni.ir/signalr",
    "apiBaseUrl": "https://pnlapi.mirrokni.ir",
    "phone": null,
    "sendOtpUrl": null,
    "verifyCodeUrl": null,
    "auth": {},
    "config": {},
    "active": false,
    "metadataRefreshIntervalMs": 60000,
    "createdAt": "2026-06-17T08:52:43.897Z",
    "updatedAt": "2026-06-17T08:52:43.897Z"
  },
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"
}
```

---

#### `provider.updated`

Published in `ProviderService.update()` after any field update (including `active` toggle via PATCH).

**Routing key:** `provider.<key>.updated`

**Data:** Full `ProviderEntity` object (post-update).

---

#### `provider.activated`

Published in `ProviderService.toggleActive()` when a provider transitions to active.

**Routing key:** `provider.<key>.activated`

**Data:** Full `ProviderEntity` object with `active: true`.

---

#### `provider.deactivated`

Published in `ProviderService.toggleActive()` when a provider transitions to inactive.

**Routing key:** `provider.<key>.deactivated`

**Data:** Full `ProviderEntity` object with `active: false`.

---

#### `provider.otp.sent`

Published in `ProviderService.sendOtp()` after OTP is successfully dispatched.

**Routing key:** `provider.<key>.otp.sent`

**Data:**
```jsonc
{
  "pattern": "provider.otp.sent",
  "data": {
    "key": "mirrokni",
    "phone": "09120000000"
  },
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"
}
```

---

#### `provider.otp.verified`

Published in `ProviderService.verifyOtp()` after OTP verification succeeds and provider is activated.

**Routing key:** `provider.<key>.otp.verified`

**Data:** Full `ProviderEntity` object with `active: true` and populated `auth.token`.

---

#### `provider.connected`

Published in `ProviderManagerService.startProvider()` after the provider WebSocket/SignalR connection is established.

**Routing key:** `provider.<key>.connected`

**Data:**
```jsonc
{
  "pattern": "provider.connected",
  "data": {
    "key": "mirrokni",
    "category": "zaryar",
    "baseUrl": "https://pnlapi.mirrokni.ir/signalr"
  },
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"
}
```

---

#### `provider.disconnected`

Published in `ProviderManagerService.stopProvider()` when a provider is stopped or disconnected.

**Routing key:** `provider.<key>.disconnected`

**Data:**
```jsonc
{
  "pattern": "provider.disconnected",
  "data": {
    "key": "mirrokni"
  },
  "timestamp": "2026-06-20T11:00:00.000Z",
  "providerKey": "mirrokni"
}
```

---

#### `arbitrage.scan`

Published in `ArbitrageService.broadcast()` after every scan (startup, real-time tick, interval, or manual).

**Routing key:** `arbitrage.scan`

**Data:** Full `ArbitrageScanResult` (the array of ranked `signals` plus scan metadata).

---

#### `arbitrage.signal`

Published in `ArbitrageService.broadcast()` once per **newly detected** opportunity (signals already present in the previous scan are not re-published).

**Routing key:** `arbitrage.signal`

**Data:**
```jsonc
{
  "pattern": "arbitrage.signal",
  "data": {
    "id": "f0e1...",
    "key": "101:arianatala->mirrokni",   // stable: <itemId>:<buyProvider>-><sellProvider>
    "itemId": 101,
    "itemName": "سکه امامی",
    "groupId": 2,
    "groupName": "مسکوکات",
    "unit": "عدد",
    "buyLeg":  { "providerKey": "arianatala", "itemId": 101, "action": "buy",  "price": 184980000, "priceStr": "...", "timestamp": "..." },
    "sellLeg": { "providerKey": "mirrokni",   "itemId": 101, "action": "sell", "price": 185720000, "priceStr": "...", "timestamp": "..." },
    "legs": [ /* [buyLeg, sellLeg] */ ],
    "profitToman": 740000,
    "profitPercent": 0.4,
    "profitGold": 0,
    "goldPriceRef": 184980000,
    "deadline": "2026-06-20T11:00:30.000Z",
    "detectedAt": "2026-06-20T11:00:00.000Z"
  },
  "timestamp": "2026-06-20T11:00:00.000Z"
}
```

---

### Consuming

To subscribe to messages, inject `RabbitMQService` and call `subscribe()` with the desired pattern, then call `startConsuming()`:

```typescript
import { RabbitMQService, MessagePatterns, RabbitMQMessage } from './rabbitmq/rabbitmq.module';

@Injectable()
export class SomeConsumer {
  constructor(private readonly rmq: RabbitMQService) {}

  async onModuleInit() {
    await this.rmq.subscribe(MessagePatterns.PRICE_UPDATE, (msg: RabbitMQMessage) => {
      console.log('Price update:', msg.data);
    });
    await this.rmq.subscribe(MessagePatterns.PROVIDER_CREATED, (msg: RabbitMQMessage) => {
      console.log('Provider created:', msg.data);
    });
    await this.rmq.startConsuming();
  }
}
```
