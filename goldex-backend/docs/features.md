# goldex-backend — Feature & Architecture

Global prefix `api`, URI versioning `v1`. NestJS, TypeORM (Postgres), EventEmitter, ScheduleModule, JwtModule, I18n.

## Module architecture

```mermaid
flowchart TD
    App[AppModule] --> Core[Config / TypeOrm / Jwt / I18n / EventEmitter / Schedule / ServeStatic]
    App --> User[user: auth, 2FA, KYC, profile, devices]
    App --> Wallet[wallet: Wallet + Transaction + wallet-order]
    App --> Order[order: order + match + admin-order + order-book]
    App --> Quote[quote-request: custom-market P2P]
    App --> Admin[admin-management / admin-wallet / admin-kyc / admin-pair / admin-symbol]
    App --> Credit[credit: margin / expiry / settle]
    App --> Warehouse[warehouse: requests, packets, allocation]
    App --> Finance[provider-finance / financial / payment-bus / payment-callback]
    App --> Notif[notification / mail / sms / telegram-notifier / user-telegram]
    App --> Pricing[provider-pair-mapping / admin-monitoring / websocket market]
    App --> Misc[shahin / crm / user-level / discount / minio / ocr / redis / rabbitmq]
```

## Auth: OTP registration → login

```mermaid
sequenceDiagram
    participant C as Client
    participant A as AuthController
    participant S as UserService
    participant R as Redis
    participant K as Kavenegar SMS

    C->>A: POST /auth/send-otp {phone}
    A->>S: sendOtpViaSms(phone, true)
    S->>S: find or create NEW_USER
    S->>R: set otp:{id} (hashed, 300s)
    S->>K: sendOTP(phone)
    K-->>S: ok
    A-->>C: 201 {message:"OTP sent"}

    C->>A: POST /auth/verify-otp {phone, otp}
    A->>S: verifyOtpByPhone(phone, otp)
    S->>R: get otp:{id}
    S->>S: bcrypt.compare (or code 12345 bypass)
    S->>R: del otp:{id}
    S->>S: NEW_USER → temp token + temp_registration key
    A-->>C: 201 {requiresRegistration:true, temporaryToken, userId}

    C->>A: POST /auth/complete-registration {temporaryToken, userId, ...}
    A->>S: completeRegistrationWithPhone
    S->>S: hash password, role → CUSTOMER, wallets, market types
    S->>S: profile save + user save
    A-->>C: 201 {access_token, refresh_token}
```

## Custom-market (quote) flow

```mermaid
flowchart TD
    Q[POST /quote-requests] --> V{validate + lock balance}
    V --> P[create PENDING]
    P --> F{find opposite pending}
    F -->|compatible equal qty| S[settleMatchPair<br/>one txn, pessimistic locks]
    F -->|no match| A[alertMatchOpportunity<br/>notify seller]
    S --> MATCHED
    A --> P2[stays PENDING, await accept]
    P2 --> M[POST /{id}/match seller approves]
    M --> S
    S --> W[wallets: XAU seller→buyer, IRR buyer→seller<br/>net commissions]
```

## Order state machine (market / limit)

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PARTIALLY_COMPLETED
    PENDING --> COMPLETED
    PENDING --> CANCELLED
    PENDING --> REJECTED
    PARTIALLY_COMPLETED --> COMPLETED
    PARTIALLY_COMPLETED --> CANCELLED
    COMPLETED --> [*]
    CANCELLED --> [*]
    REJECTED --> [*]
```

## Credit / lending lifecycle

```mermaid
flowchart LR
    CREATE[createCredit<br/>freeze material wallets, CREDIT_DEPOSIT] --> ACTIVE[PENDING/ACTIVE]
    ACTIVE -->|margin call drawdown >= threshold| MC[MARGIN_CALLED<br/>cancelCreditOrder + liquidation]
    ACTIVE -->|expiry cron every 30min| EXP[EXPIRED<br/>freeze ALL wallets]
    ACTIVE -->|settle| ST[SETTLED<br/>unfreeze + settlement]
    ACTIVE -->|cancel| CA[CANCELLED<br/>unfreeze]
    MC --> ST
```

## Payment / settlement (backend ↔ cbp)

```mermaid
flowchart TD
    B[backend] -- RabbitMQ payment.request.deposit / withdraw --> C[goldex-cbp]
    C -- RabbitMQ payment.processing / succeeded / failed --> B
    C --> K[Kaino: chargeWallet / verify / paymentOrder]
    C --> S[Shahin: batch-transfer]
    B -- cbp.admin.request RPC --> C
    C -- cbp.admin.response --> B
    B -- HTTP proxy api/shahin --> S
```
