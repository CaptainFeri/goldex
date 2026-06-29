# goldex-pricing-engine

> **Real-time pricing engine & arbitrage detection microservice**  
> Built with NestJS 11 + TypeScript + PostgreSQL + Redis + RabbitMQ

---

## Overview

`goldex-pricing-engine` is a microservice that connects to upstream Iranian gold/currency price providers (Zaryar via SignalR, TalaAb via WebSocket), streams real-time prices, performs cross-provider arbitrage opportunity detection, and broadcasts price data via Redis Pub/Sub and RabbitMQ to downstream consumers.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | NestJS 11 + TypeScript 6 |
| **Database** | PostgreSQL (TypeORM with 13 migrations) |
| **Cache / Pub-Sub** | Redis (ioredis) |
| **Message Broker** | RabbitMQ (amqplib) |
| **WebSocket** | ws (client), Socket.IO (server) |
| **Job Queue** | Bull |
| **API Docs** | Swagger |
| **Container** | Docker + docker-compose |

---

## Features

### Real-time Price Providers

| Provider | Protocol | Authentication |
|----------|----------|---------------|
| **Zaryar** | Microsoft SignalR over WebSocket | OTP via SMS |
| **TalaAb** | Pusher-compatible WebSocket | OTP via SMS |

Both providers are abstracted via `BaseRealtimeProvider` with pluggable OTP handlers.

### Data Flow

```
Zaryar (SignalR) ──┐
                   ├──> Pricing Engine ──> Redis Pub/Sub (price:updates)
TalaAb (WebSocket) ─┘                    └──> RabbitMQ (price.<key>.update)
                                              └──> Arbitrage Scanner
                                                    ├──> Redis (arbitrage:updates)
                                                    └──> RabbitMQ (arbitrage.signal)
```

### Arbitrage Detection

- Scans all provider prices every 10 seconds (plus real-time debounce)
- Finds buy-low/sell-high opportunities across providers
- Per-gram price calculation (mithqal-to-gram conversion)
- Results broadcast via Redis Pub/Sub and RabbitMQ

### Item Classification

- **Coins** (Bahar Azadi, Emami, etc.)
- **Molten Gold** (gram-based)
- **Silver**

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `CRUD` | `/providers` | Provider configuration management |
| `POST` | `/providers/:id/otp/send` | Send OTP to provider mobile |
| `POST` | `/providers/:id/otp/verify` | Verify OTP and activate provider |
| `GET` | `/providers?all-prices=1` | All current prices |
| `GET` | `/providers?best-prices=1` | Best prices across providers |
| `GET` | `/providers/:id/deal-view` | Deal view for a specific item |
| `GET` | `/arbitrage` | Current arbitrage signals |
| `POST` | `/arbitrage/scan` | Trigger manual arbitrage scan |
| `GET` | `/arbitrage/stats` | Arbitrage engine statistics |

---

## Getting Started

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Run mock provider server (for development/testing)
npm run mock
```

### Docker

```bash
docker-compose -f docker-compose.dev.yml up
```

---

## Mock Server

A standalone mock server (`npm run mock`) that imitates both Zaryar (SignalR) and TalaAb (Pusher) upstreams. Supports:

- Load testing and failure scenarios
- Shop open/close simulation
- Control API at `/__mock/*` for dynamic scenario manipulation

---

## Message Brokers

### Redis Pub/Sub Channels

| Channel | Payload | Description |
|---------|---------|-------------|
| `price:updates` | Price tick | Every price update from any provider |
| `arbitrage:updates` | Scan result | Arbitrage opportunity scan results |

### RabbitMQ Exchange: `signalr.providers`

| Routing Key | Description |
|-------------|-------------|
| `price.<providerKey>.update` | Price update from a specific provider |
| `provider.<key>.created/updated/activated/deactivated` | Provider lifecycle events |
| `provider.<key>.connected/disconnected` | Provider connection state |
| `provider.<key>.otp.sent/verified` | OTP flow events |
| `arbitrage.scan` | Scan trigger |
| `arbitrage.signal` | Arbitrage opportunity signal |

---

## Project Structure

```
src/
├── real-time-provider/     # Provider abstraction & implementations
│   ├── providers/          # ZaryarSignalR, TalaAbWebSocket
│   ├── interfaces/         # Base provider & OTP handler interfaces
│   ├── entity/             # Provider, Deal, Balance entities
│   └── types/              # Provider-specific types
├── arbitrage/              # Arbitrage detection engine
├── rabbitmq/               # Message patterns & publishing
├── redis/                  # Redis service
├── migrations/             # 13 database migrations
└── common/                 # Console formatter, utilities
mock-server/                # Provider mock server
```

---

## Related Projects

| Project | Description |
|---------|-------------|
| `goldex-backend` | Core NestJS API server (RabbitMQ/Redis consumer) |
| `goldex-admin-panel` | Admin SPA (price comparison charts) |
| `goldex-user-panel` | Customer-facing trading SPA |
