# goldex-user-panel — Customer Web App

React (Vite) SPA for customers: auth (phone+OTP / password), trading, wallets, warehouse, KYC, credit, levels, support tickets. Talks to goldex-backend REST + real-time Socket.IO (`/market`) for market prices.

## Architecture

```mermaid
flowchart TD
    APP[App.jsx React Router] --> AUTH[AuthProvider / AuthContext]
    APP --> PROT[ProtectedRoute]
    PROT --> LAYOUT[AppLayout + Sidebar + BottomNav]
    LAYOUT --> PAGES[Pages]

    subgraph AUTH_
      PAGES --> L[Login / Register]
      PAGES --> FP[ForgotPassword]
      PAGES --> RP[ResetPassword]
    end
    subgraph TRADE_
      PAGES --> T[TradePage]
      PAGES --> E[EliteTradePage]
      PAGES --> O[OfferPage]
      PAGES --> OP[OrderBook depth]
    end
    subgraph ACCOUNT_
      PAGES --> W[WalletPage]
      PAGES --> WH[WarehousePage]
      PAGES --> PR[ProfilePage]
      PAGES --> K[KycPage]
      PAGES --> S[SessionsPage]
      PAGES --> ST[SettingsPage]
      PAGES --> C[CreditPage]
      PAGES --> LV[LevelPage]
      PAGES --> N[NotificationPage]
      PAGES --> SU[SupportPage]
    end

    PAGES --> API[services/api.js grouped endpoints]
    API --> HTTP[services/http.js axios + token]
    HTTP --> BE[goldex-backend /api/v1]
    PAGES --> SOCK[services/socket.js Socket.IO /market]
    SOCK --> BE
    PAGES --> HK[useMarketPrices hook]
    HK --> SOCK
```

## Auth flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as AuthPage
    participant API as authApi
    participant BE as goldex-backend

    U->>A: phone
    A->>API: sendOtp(phone)
    API->>BE: POST /auth/send-otp
    U->>A: enter OTP
    A->>API: verifyOtp(phone, otp)
    API->>BE: POST /auth/verify-otp
    alt new user
        API->>BE: complete-registration (tempToken)
    else existing
        API->>BE: login(phone, password)
    end
    BE-->>A: token → AuthContext persist
```

## Key data flows

```mermaid
flowchart LR
    MKT[marketApi pairs/access] --> BE2[goldex-backend]
    QR[quoteRequestApi create/my/cancel] --> BE2
    ORD[orderApi create/list/cancel] --> BE2
    OB[orderBookApi depth] --> BE2
    WH2[warehouseApi deposit/withdraw/packets] --> BE2
    DEP[depositApi create + upload-and-ocr] --> BE2
    WDR[withdrawApi create + upload-and-ocr] --> BE2
    DEP --> OCR[backend -> OCR service]
    WDR --> OCR
    KYC[kycApi level-1/level-2/upload] --> BE2
    LIC[creditApi active/notifications] --> BE2
    TKT[ticketApi create/messages/satisfaction] --> BE2
    NOT[notificationApi list/unread/read] --> BE2
```

> Endpoints group into: auth, profile, kyc, wallet, market, quote-requests, order-book, orders, warehouse, credit, base-info, deposit, withdraw, user-level, notifications, tickets. Public calls skip the auth header via `{ skipAuth: true }`.
