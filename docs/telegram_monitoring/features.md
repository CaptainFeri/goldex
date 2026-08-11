# telegram_monitoring — Telegram Channel Monitor + Market Maker

NestJS service that logs into Telegram via GramJS `TelegramClient`, monitors configured provider channels, parses live price messages, detects arbitrage / best-price / price-movement opportunities, renders chart images, and shares alerts to a target channel. Tracks a virtual wallet of executed trades and reports status (text + Excel) to a report channel. Redis-backed persistence + SSE + RabbitMQ pub.

## Module architecture

```mermaid
flowchart TD
    App[AppModule] --> CFG[ConfigModule]
    App --> EE[EventEmitterModule]
    App --> RD[RedisModule / RedisService]
    App --> TG[TelegramModule / TelegramService<br/>GramJS TelegramClient]

    TG --> SS[SessionManagerService<br/>StringSession persistence]
    TG --> PH[PriceHistoryService<br/>buckets + arbitrage detect]
    TG --> MM[MarketMakerService<br/>market state + opportunities]
    TG --> CI[ChartImageService<br/>render chart PNG]
    TG --> RMP[RabbitMQPublisherService]

    MM --> REDIS2[Redis persistence]
    MM --> RMP

    TG --> AUTH[AuthController /api/auth<br/>status code password resend retry session]
    TG --> WC[WalletController /api/wallet]
    TG --> PC[PriceController /api/prices + SSE stream]
    TG --> AC[ArbitrageController /api/arbitrages]
    TG --> MC[MarketMakerController /api/market]
    TG --> OC[OpportunityController /api/opportunities]
```

## Price monitor → opportunity pipeline

```mermaid
flowchart LR
    CH[Monitored provider channels] -->|NewMessage event| TG[TelegramService.handleNewMessage]
    TG --> PARSER[parsePriceMessage]
    PARSER --> HIST[PriceHistoryService.record]
    HIST --> MM[MarketMakerService.onPrice]
    MM --> STATE[updateMarketState]
    MM --> MOVE[detectPriceMovement &gt;0.5%]
    MM --> BEST[detectBestPrice]
    MOVE --> ALERT1[formatPriceMovementAlert]
    BEST --> ALERT2[formatBestPriceAlert]
    ALERT1 --> SHARE[shareToTarget channel]
    ALERT2 --> SHARE
    HIST --> ARB[detectArbitrage buy&lt;sell same item]
    ARB -->|new &amp; unreported| CHART[ChartImageService.render]
    CHART --> PHOTO[sendPhotoToTarget]
    PHOTO -->|chart fails| TEXTSHARE[text-only alert]
```

## Auth + connection lifecycle

```mermaid
sequenceDiagram
    participant N as Nest bootstrap
    participant TG as TelegramService
    participant SM as SessionManager
    participant API as AuthController

    N->>TG: onModuleInit → initClient
    TG->>SM: loadSessionString
    TG->>TG: TelegramClient(apiId, apiHash)
    TG->>TG: connectWithRetry (3 attempts)
    alt authorized
        TG->>TG: finalizeInitialization + health check
    else not authorized
        TG->>TG: startDeferredAuth (await code)
        API->>TG: POST /api/auth/code → submitCode
    end
    TG->>SM: persistSession (StringSession)
    loop every 60s
        TG->>TG: probeAuthKey
        alt AUTH_KEY_UNREGISTERED (401)
            TG->>SM: clearPersistedSessions → re-login
        end
    end
```

## Callback / request routing

```mermaid
flowchart TD
    CB[CallbackQueryEvent wallet:excel] --> WX[WalletService build Excel .xlsx]
    WX --> SEND[WalletService sendWalletExcelFile to chat]
    SCHED[Wallet reporting job] --> STATUS[WalletService.sendWalletStatusReport<br/>edit-in-place or new msg]
    SCHED --> REP[WalletService.sendWalletReport text]
```

## HTTP + data view (admin dashboard)

```mermaid
flowchart LR
    UI[Dashboard /public/index.html] --> REST[REST controllers]
    REST --> W[Wallet /api/wallet · trades · symbols]
    REST --> P[Prices /api/prices · filters]
    REST --> A[Arbitrage /api/arbitrages · summary · wallet]
    REST --> M[Market /api/market · best-buys · best-sells]
    REST --> O[Opportunities /api/opportunities]
    REST --> SSE[/api/prices/stream SSE real-time]
    REST --> AUTH2[/api/auth status]
```

> Caveats: market-maker only tracks `subType=normal` with no description (ignores reversed/custom deals); wallet report message is edited in place to avoid flooding the channel; Redis is the persistence layer (no Postgres in this service).
