# Price Tracker — Architecture

## Directory Structure

```
src/
├── common/
│   ├── enums/
│   │   └── index.ts            ← AssetCategory, ProviderBrand, ProviderSite, ConnectionState
│   ├── interfaces/
│   │   └── index.ts            ← RawPriceTick, PriceRecord, InstrumentMeta, TrackerStats …
│   └── decorators/
│       └── instrument-registry.ts  ← Maps (site, itemId) → name + category
│
├── config/
│   └── providers.config.ts     ← Hub URLs, hub names, enabled flags per site
│
├── providers/
│   ├── base/
│   │   └── base-provider.adapter.ts  ← Abstract base every adapter extends
│   └── zaryar/
│       ├── zaryar-provider.adapter.ts  ← Mirrokni SignalR adapter (Zaryar brand)
│       └── zaryar.module.ts
│
├── database/
│   ├── price-store.ts          ← In-memory latest + capped history, category/site queries
│   └── database.module.ts
│
├── tracking/
│   ├── services/
│   │   └── price-tracker.service.ts  ← Orchestrates adapters → store, periodic log
│   └── tracking.module.ts      ← Wires adapters array + PriceTrackerService
│
├── health/
│   └── prices.controller.ts    ← REST: /prices, /prices/stats, /prices/category/:cat …
│
├── app.module.ts               ← Root module (thin)
└── main.ts                     ← Bootstrap
```

---

## Key Concepts

### Brands & Sites

```
ProviderBrand.ZARYAR
  └── ProviderSite.MIRROKNI   (mirrokni.ir)
  └── ProviderSite.ZARYAR_MAIN  (future)

ProviderBrand.TGJU  (future)
  └── ProviderSite.TGJU_MAIN
```

### Asset Categories (extendable)

| Enum value   | Meaning             |
|--------------|---------------------|
| `currency`   | USD, EUR, GBP …     |
| `gold`       | Gold 18K, Silver …  |
| `crypto`     | BTC, ETH …          |
| `stock`      | Company shares      |
| `commodity`  | Oil, Copper …       |
| `unknown`    | Not yet registered  |

---

## How to Add a New Provider

1. Add a new `ProviderSite` and optionally `ProviderBrand` value to `common/enums/index.ts`.
2. Create `src/providers/<brand>/<brand>-provider.adapter.ts` extending `BaseProviderAdapter`.
3. Register its config in `config/providers.config.ts`.
4. Create a NestJS module in `src/providers/<brand>/<brand>.module.ts`.
5. Import the module in `TrackingModule` and append the adapter to the `ADAPTERS` factory.
6. Register instruments in `common/decorators/instrument-registry.ts`.

---

## REST Endpoints

| Method | Path                              | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/prices`                         | All latest prices                  |
| GET    | `/prices/stats`                   | Connection states + store stats    |
| GET    | `/prices/category/:category`      | Filter by AssetCategory            |
| GET    | `/prices/site/:site`              | Filter by ProviderSite             |
| GET    | `/prices/history/:site/:itemId`   | Tick history for one instrument    |
