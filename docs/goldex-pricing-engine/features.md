# goldex-pricing-engine — Real-time Provider Pricing + Arbitrage

NestJS service that connects to external gold providers over WebSocket/SignalR (Talaab, Zaryar), normalizes live prices, caches in Redis, publishes to RabbitMQ, and runs a real-time arbitrage scanner. TypeORM Postgres (`providers`, `provider_deals`, `provider_balances`).

## Module architecture

```mermaid
flowchart TD
    App[AppModule] --> ORM[TypeORM Postgres<br/>providers / provider_deals / provider_balances]
    App --> RAB[RabbitMQModule<br/>topic exchange signalr.providers]
    App --> RTP[RealtimeProviderModule]
    App --> ARB[ArbitrageModule]
    App --> RD[RedisModule / RedisService<br/>current prices + history + pub/sub]

    RTP --> CON[ProvidersController<br/>/api/v1/providers/**]
    RTP --> PM[ProviderManagerService<br/>lifecycle + reconnect]
    RTP --> PSRV[ProviderService<br/>CRUD + OTP activate]
    RTP --> ACC[ProviderAccountService<br/>orders + balances]
    RTP --> ORD[ProviderOrderService<br/>place + track orders]
    RTP --> MET[ItemMetadataService<br/>enrich prices]
    RTP --> BASE[BaseRealtimeProvider<br/>socket, reconnect, emitPriceUpdate]
    BASE -->|subclass| TALAAB[TalaabWebsocketProvider]
    BASE -->|subclass| ZARYAR[ZaryarSignalRProvider]
    BASE -->|subclass| MOCK[MockProviders]
    RTP --> TALOTP[TalaabOtpHandler]
    RTP --> ZAROTP[ZaryarOtpHandler]
```

## Provider connection + price pipeline

```mermaid
flowchart LR
    P[Talaab / Zaryar / Mock] -->|SignalR / WS socket| BASE[BaseRealtimeProvider]
    BASE --> AUTH[authenticate / OTP verify]
    AUTH --> LISTEN[setupSocketListeners]
    LISTEN --> NORM[normalizePrices<br/>swap inverted buy/sell]
    NORM --> ENRICH[ItemMetadataService.enrich<br/>per-gram = mithqal / 4.3318, spread%]
    ENRICH --> EMIT[emitPriceUpdate]
    EMIT --> REDIS[Redis: setCurrentPrice + history + publishPriceUpdate]
    EMIT --> RAB[RabbitMQ: price.update (provider-scoped key)]
    DISCONN[connection lost] -->|backoff 3s * 2^n, max 10| RC[scheduleReconnect]
```

## OTP activation flow (provider on-boarding)

```mermaid
sequenceDiagram
    participant ADM as Admin (API client)
    participant C as ProvidersController
    participant PS as ProviderService
    participant OH as ProviderOtpHandler (talaab/zaryar)
    participant P as Provider site

    ADM->>C: POST /providers (create inactive)
    ADM->>C: POST /providers/:id/send-otp {phone}
    C->>PS: sendOtp
    PS->>OH: requestOtp(phone)
    OH->>P: POST login/otp
    P-->>OH: otp ticket
    ADM->>C: POST /providers/:id/verify-otp {otp}
    C->>PS: verifyOtp
    PS->>OH: verifyOtp(otp)
    OH-->>PS: auth token
    PS->>PS: activate provider
    PS->>RAB[RabbitMQ]: provider.activated / provider.connected
    PS->>PM: connect provider (WebSocket/SignalR)
```

## Arbitrage engine

```mermaid
flowchart TD
    PRICES[Redis price:updates pub/sub] -->|debounce 400ms| SCAN[scanAndBroadcast]
    INTERVAL[interval 10s safety-net] --> SCAN
    MANUAL[POST /arbitrage/scan] --> SCAN
    SCAN --> ALL[getAllCurrentPrices from Redis]
    ALL --> STALE{stale &gt; 60s?}
    STALE -->|yes| DROP[skip]
    STALE -->|no| GROUP[group prices by itemId]
    GROUP --> MATCH[bestSignalForItem<br/>buy = lowest sell / sell = highest buy]
    MATCH --> PROFIT{profit &gt; minProfit &<br/>different providers?}
    PROFIT -->|no| SKIP
    PROFIT -->|yes| SIGNAL[build buy+sell leg signal]
    SIGNAL --> SORT[sort by profitToman, top N]
    SORT --> PERSIST[Redis: setArbitrageScan + history + publishArbitrageUpdate]
    PERSIST --> FRESH[filter signals new since last scan]
    FRESH --> RAB[RabbitMQ: arbitrage.scan + arbitrage.signal]
    FRESH --> EM[EventEmitter arbitrageSignal]
```

## Best prices + market map endpoints

```mermaid
flowchart LR
    BP[GET /providers/best-prices] --> COL[collect running + registered providers from Redis]
    COL --> GRP[group by groupName -> item -> provider]
    GRP --> CALC[bestBuy = max buy / bestSell = min sell<br/>spread + lastUpdate]
    MM[GET /providers/market-map] --> MET[ItemMetadataService per provider]
    MM --> PR[Redis current prices]
    MM --> JOIN[join metadata + prices]
```

> Conventions: prices keyed per provider in Redis; only fresh quotes (≤60s) feed arbitrage; signals only fan out when newly detected; providers auto-reconnect with exponential backoff.
