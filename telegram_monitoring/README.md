# telegram-monitoring

> **Real-time Telegram gold price monitor & arbitrage detector**  
> Built with NestJS 11 + TypeScript + MTProto Telegram Client

---

## Overview

`telegram-monitoring` is a NestJS application that connects to Telegram via the MTProto protocol to monitor Persian gold/currency trading channels in real time. It parses price messages, tracks buy/sell prices, automatically detects arbitrage opportunities, and provides a live charting web UI.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | NestJS 11 + TypeScript 5 |
| **Telegram Client** | MTProto via `telegram` library (not Bot API) |
| **Events** | @nestjs/event-emitter |
| **Config** | @nestjs/config |
| **Testing** | Jest |

---

## Features

### Price Monitoring

- Connects to Telegram using MTProto (API ID/Hash + phone number)
- Resolves and joins configured gold-trading channels
- Listens for new messages and callback queries in real time
- Persists session state for reconnection

### Smart Price Parsing

Extracts from Persian text messages:
- **Price** (e.g., `73,500,000` Toman)
- **Side**: `خرید` (we sell) / `فروش` (we buy)
- **Delivery type**: With transfer, same-day, cash on spot, without transfer
- **Quantity**: Number of units
- **Sub-type**: Normal, `شنا` (swap), `معکوس` (reverse)
- **Inline buttons** for order placement

### Arbitrage Detection

- Maintains an in-memory ring buffer (1,000 snapshots per category)
- Compares within same sub-type + delivery type, within a 120-second window
- Finds lowest `فروش` (buy cost) and highest `خرید` (sell revenue)
- Reports spread with executable quantity
- Avoids duplicate alerts for the same price pair

### Alerting

- Publishes formatted Persian arbitrage alerts to a target channel
- Includes per-unit and total profit calculations
- Provides tap-to-open links to source messages for quick execution

### Live Price Chart

- REST API at `/api/prices` with filtering (sub-type, delivery, side, date range)
- Chart.js frontend (RTL Persian, dark theme, interactive)
- Auto-refresh every 15 seconds
- JSONL file persistence for durability

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
# Edit .env with your Telegram API ID, Hash, and phone number

# Development (watch mode)
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Run tests
npm test
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `API_ID` | Telegram API ID (from my.telegram.org) |
| `API_HASH` | Telegram API Hash |
| `PHONE` | Phone number for authentication |
| `TARGET_CHANNEL_ID` | Channel to monitor for prices |
| `ALERT_CHANNEL_ID` | Channel to send arbitrage alerts |

---

## Testing

Unit tests cover all core logic:
- **Price parser**: 7 test cases for message extraction
- **Price formatter**: 2 test cases for alert formatting
- **Price history**: 8 test cases for arbitrage detection logic

```bash
npm test
```

---

## Project Structure

```
src/
├── config/           # Environment configuration
├── logger/           # Structured logger
├── telegram/         # Telegram client module
│   └── price/        # Price parsing, history, persistence
│       ├── price-message.parser.ts
│       ├── price-message.formatter.ts
│       ├── price-history.service.ts
│       ├── price-persistence.service.ts
│       └── price.controller.ts
public/               # Chart.js frontend (index.html)
memory/               # Project documentation
captures/             # Raw message captures for debugging
sessions/             # Telegram MTProto session files
```

---

## Important Notes

- The application uses **MTProto** (not Bot API), meaning it authenticates as a regular user
- Persian buy/sell labels have **inverted semantics** in gold trading context — documented in memory
- Session files persist authentication state on disk
- All parsed prices are appended to `data/prices.jsonl` for durability

---

## Related Projects

| Project | Description |
|---------|-------------|
| `goldex-pricing-engine` | Real-time pricing engine with arbitrage detection |
| `goldex-backend` | Core NestJS API server |
