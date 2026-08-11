# Goldex System Architecture

Cross-service integration topology. Flows over RabbitMQ (topic exchange `signalr.providers`), Redis, shared PostgreSQL, and direct HTTP.

```mermaid
flowchart LR
    subgraph Services
        BE[goldex-backend<br/>API / orders / KYC / admin / notifications]
        CBP[goldex-cbp<br/>payment gateways]
        PE[goldex-pricing-engine<br/>Zaryar/TalaAb ingestion + arbitrage]
        TG[goldex-telegram-bot<br/>user quotes/orders]
        TM[telegram_monitoring<br/>channel monitor + paper wallet]
        SF[goldex-sms-forwarder<br/>Android APK]
    end

    subgraph Infra
        RMQ[RabbitMQ<br/>signalr.providers]
        REDIS[Redis<br/>prices / presence / OTP]
        PG[(PostgreSQL<br/>multi-DB)]
        MIO[MinIO]
    end

    subgraph External
        KAINO[Kaino IPG]
        SHAHIN[Shahin / parszargar]
        JIBIT[Jibit KYC]
        MG[Mailgun]
        KAV[Kavenegar SMS]
        ZT[Zaryar / TalaAb]
        OCR[OCR workers]
        TAPI[Telegram Bot API]
        MT[MTProto user session]
    end

    BE --> PG
    CBP --> PG
    PE --> PG
    TG --> PG

    BE --> RMQ
    CBP --> RMQ
    PE --> RMQ
    TM --> RMQ

    BE --> REDIS
    BE --> MIO
    PE --> REDIS
    TM --> REDIS

    CBP --> KAINO
    CBP --> SHAHIN
    BE --> JIBIT
    BE --> MG
    BE --> KAV
    BE --> OCR
    PE --> ZT
    TG --> TAPI
    TM --> MT
    SF --> PE

    TG -- HTTP /api/v1 --> BE
    TM -. market state via broker/redis .-> BE
```

## Message flows on RabbitMQ (`signalr.providers`)

| From → To | Routing keys |
|---|---|
| backend → cbp | `payment.request.deposit`, `payment.request.withdraw`, `payment.request.withdraw.approve`, `symbol.sync`, `cbp.admin.request` |
| cbp → backend | `payment.processing`, `payment.succeeded`, `payment.failed`, `payment.rejected`, `cbp.admin.response` |
| pricing-engine → backend | `price.update`, `price.history`, `price.snapshot`, `provider.*`, `provider.deals.updated`, `provider.balance.updated` |
| backend → pricing-engine | `order.place.request` |
| telegram_monitoring → backend | `telegram.market.snapshot`, `telegram.opportunity` |

## Data stores

- **PostgreSQL** — `GOLDEX-DB` (backend), `gold_price_db` (pricing engine), `goldex_telegram_bot_db` (telegram bot), `payment-db` (cbp).
- **Redis** — backend (prices, OTP, presence); pricing engine (current/history/snapshot); telegram_monitoring (`wallet:*`, `price:*`, `arbitrage:*`, `opportunity:*`).
- **MinIO** — KYC documents, deposit/withdraw images, packet images.
