# goldex-telegram-bot — Feature & Architecture

Pure Telegram bot (long-polling, `node-telegram-bot-api`). No HTTP API. NestJS + TypeORM Postgres (`telegram_users`), talks to goldex-backend over HTTP `/api/v1`.

## Module architecture

```mermaid
flowchart TD
    App[AppModule] --> Bot[BotModule / BotService<br/>handlers: /start /wallet /profile /help, contact, callback, message]
    Bot --> User[UserModule / UserService<br/>TypeORM telegram_users]
    Bot --> Backend[BackendApiModule / BackendApiService<br/>HTTP -> goldex backend]
    Bot --> Chan[ChannelModule / ChannelService<br/>stub]
    User --> DB[(Postgres telegram_users)]
    Backend --> BE[goldex-backend /api/v1]
    Bot --> TAPI[Telegram Bot API<br/>long-poll + sendMessage]
```

## User state machine

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> WAITING_FOR_OTP : contact + phone set
    WAITING_FOR_OTP --> AUTHENTICATED : loginWithOtp role==3 (Partner)
    WAITING_FOR_OTP --> IDLE : requiresRegistration / 2FA / role!=3 / failure
    AUTHENTICATED --> WAITING_FOR_QUOTE_PAIR : quote request
    WAITING_FOR_QUOTE_PAIR --> WAITING_FOR_QUOTE_SIDE : pair chosen
    WAITING_FOR_QUOTE_SIDE --> WAITING_FOR_QUOTE_AMOUNT : side
    WAITING_FOR_QUOTE_AMOUNT --> WAITING_FOR_QUOTE_PRICE : amount
    WAITING_FOR_QUOTE_PRICE --> WAITING_FOR_QUOTE_DESC : price
    WAITING_FOR_QUOTE_DESC --> WAITING_FOR_QUOTE_CONFIRM : description
    WAITING_FOR_QUOTE_CONFIRM --> AUTHENTICATED : confirm/cancel
    AUTHENTICATED --> WAITING_FOR_ORDER_CANCEL : cancel:{id} callback
    WAITING_FOR_ORDER_CANCEL --> AUTHENTICATED : yes / abort
    WAITING_FOR_QUOTE_* --> AUTHENTICATED : cancel escape
```

## Quote → publish → match flow

```mermaid
sequenceDiagram
    participant U as User (DM)
    participant B as BotService
    participant BK as BackendApiService
    participant BE as goldex-backend
    participant CH as Telegram channel

    U->>B: choose pair/side/amount/price/desc
    B->>B: accumulate metadata, state chain F8a..F8f
    U->>B: confirm
    B->>B: wallet-balance check (buy: quote cur; sell: base)
    B->>BK: createQuoteRequest
    BK->>BE: POST /quote-requests
    BE-->>BK: PENDING orderId
    B->>B: track activeOrders[orderId]=PENDING
    B->>CH: publish order card (fulfill button)
    B->>B: scan opposite PENDING order (local)
    alt local match found
        B-->>U: notify buyer + seller (accept button)
    else backend matchAlert
        B-->>U: notify opportunity
    else none
        B-->>U: "published, wait"
    end
```

## Fulfill + accept (peer match)

```mermaid
sequenceDiagram
    participant U2 as Peer (fulfill click)
    participant B as BotService
    participant BK as BackendApiService
    participant BE as goldex-backend

    U2->>B: fulfill:{orderId}
    B->>B: gate auth+partner, prevent self-fulfill
    B->>BK: getQuoteRequestById (must be PENDING)
    B->>B: wallet-balance check opposite side, re-check PENDING
    B->>BK: createQuoteRequest (opposite side)
    B-->>U2: notify seller accept:{orderId}
    U2->>B: accept:{orderId}
    B->>BK: acceptMatch(orderId)
    BK->>BE: POST /quote-requests/{id}/match (lock, txn, commissions, notify)
    B->>B: mark both MATCHED, edit channel cards "completed"
```

## Background jobs

```mermaid
flowchart LR
    Monitor[Order monitor every 30s] --> AuthUsers[findAllAuthenticated]
    AuthUsers --> Poll[getMyQuoteRequests per user]
    Poll --> Matched{MATCHED?}
    Matched -->|yes| Notify[notify order completed / wallet updated]
```

> Caveats: `/logout` is defined but never wired; `isChannelAdmin` and `ChannelService.sendMessage` are unused scaffolding; order/quote state lives in goldex-backend, not here.
