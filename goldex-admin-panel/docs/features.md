# goldex-admin-panel — Admin Web App

React (Vite) TS SPA for operators/admins: dashboard, users, KYC, wallets, finance, CBP payments, provider finance, orders/order-book, symbols/pairs/mappings, levels, discounts, credits, deposits/withdraws, OCR admin, telegram market, CRM. Single axios client to goldex-backend `/api/v1`.

## Architecture

```mermaid
flowchart TD
    APP[App.tsx React Router] --> LOGIN[LoginPage]
    APP --> REQ[RequireAuth<br/>checkSession on 401 -> /login]
    REQ --> LAY[Layout + MobileNav]
    LAY --> PAGES[~30 Pages]

    PAGES --> CLIENT[api/client.ts axios /api/v1<br/>token header + Accept-Language fa<br/>401 interceptor -> clear + redirect]
    PAGES --> CBP[api/cbp.ts payments]
    PAGES --> TG[api/telegram.ts market]
    PAGES --> TYPES[api/types.ts]
    CLIENT --> BE[goldex-backend]

    subgraph CORE_
      PAGES --> D[Dashboard]
      PAGES --> U[Users / User360 / Admins]
      PAGES --> K[Kyc]
      PAGES --> W[Wallets]
    end
    subgraph MARKET_
      PAGES --> S[Symbols / Pairs / Mappings]
      PAGES --> OB[OrderBook / Orders]
      PAGES --> TM[TelegramMarket]
      PAGES --> CP[Compare]
    end
    subgraph FIN_
      PAGES --> F[Finance / FinanceLogs]
      PAGES --> PF[ProviderFinance]
      PAGES --> CBP2[Cbp payments]
      PAGES --> D2[Deposits / Withdraws]
      PAGES --> CR[Credits / Discounts / Levels]
    end
    subgraph OPS_
      PAGES --> WH[Warehouse]
      PAGES --> OCR[OcrAdmin]
      PAGES --> N[Notifications]
      PAGES --> CRM[Crm pages: dashboard/users/tickets/tags/segments]
    end
```

## Data flow

```mermaid
flowchart LR
    UI[Admin page component] --> C[api/client.ts] --> BE[goldex-backend /api/v1]
    BE --> CBP3[goldex-cbp via RabbitMQ/HTTP]
    BE --> PE[goldex-pricing-engine]
    CBP3 --> G[payment gateways]
    TM[TelegramMarketPage] --> TG2[telegram_monitoring / pricing-engine market data]
    OcrAdminPage --> OCR2[OCR service]
```

> Auth token stored in `localStorage` (`goldex_admin_token`); every request sends `Accept-Language: fa`; any 401 clears the token and redirects to login. Backend responses are unwrapped from `{ status, message, data, errors }`.
