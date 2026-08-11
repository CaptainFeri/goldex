# goldex-cbp — Payment Engine

NestJS headless service. No user-facing HTTP API — driven entirely by RabbitMQ commands from goldex-backend, plus one external gateway callback endpoint. TypeORM Postgres (`payments`, `payment_symbols`).

## Module architecture

```mermaid
flowchart TD
    App[AppModule] --> RB[RabbitMQModule / RabbitMQService<br/>subscribe + publish + RPC]
    App --> PM[PaymentsModule]
    App --> SY[SymbolsModule / SymbolsService<br/>payment_symbols]
    App --> KA[KainoModule<br/>kaino-http.client, auth, wallet]
    App --> GW[GatewaysModule]

    PM --> EV[PaymentEventsService]
    PM --> PS[PaymentsService]
    PM --> CREQ[PaymentRequestConsumer<br/>deposit / withdraw / withdraw.approve]
    PM --> SSYNC[SymbolSyncConsumer]
    PM --> CADM[CBPAdminConsumer + Service]
    PM --> KC[KainoCallbackController<br/>POST /api/v1/payments/callbacks/kaino]
    PM --> REG[GatewayRegistry]
    REG --> KAINO_G[KainoGateway]
    REG --> SHAHIN_G[ShahinGateway]
    PS --> DB[(Postgres payments)]
    PS --> SY
    PS --> REG
    PS --> EV
    EV --> RB
    CREQ --> RB
    CREQ --> PS
```

## Deposit flow (backend command → gateway → callback)

```mermaid
sequenceDiagram
    participant BE as goldex-backend
    participant RB as RabbitMQ
    participant C as PaymentRequestConsumer
    participant PS as PaymentsService
    participant SY as SymbolsService
    participant REG as GatewayRegistry
    participant G as Kaino/Shahin gateway
    participant KC as KainoCallbackController
    participant EV as PaymentEventsService

    BE->>RB: publish payment.request.deposit
    RB->>C: consume
    C->>PS: createDepositFromCommand(cmd)
    PS->>SY: findBySlug(slug)
    alt symbol not found
        PS->>PS: create FAILED payment
        PS->>EV: payment.failed
        PS-->>C: throw NotFound
    else ok
        PS->>PS: validate depositTypes + resolve gateway
        PS->>PS: create PENDING payment (DP-XXXXXXXX)
        alt gateway-bound type
            PS->>G: gateway.deposit({reference, callbackUrl})
            G-->>PS: payUrl / ipgReference / _stan
            PS->>PS: status=PROCESSING
            PS->>EV: payment.processing
        else non-gateway type
            PS->>PS: save PENDING only
        end
    end
    Note over G,KC: Payer redirected to IPG, returns here
    G->>KC: POST /payments/callbacks/kaino?reference=
    KC->>PS: handleKainoCallback(ref, body)
    PS->>REG: gateway.verify(...)
    alt verified
        PS->>PS: status=SUCCEEDED, completedAt
        PS->>EV: payment.succeeded
    else failed
        PS-->>KC: {success:false, raw}
    end
```

## Withdraw flow (approval → transfer)

```mermaid
sequenceDiagram
    participant BE as goldex-backend
    participant RB as RabbitMQ
    participant C as PaymentRequestConsumer
    participant PS as PaymentsService
    participant REG as GatewayRegistry
    participant G as gateway
    participant EV as PaymentEventsService

    BE->>RB: publish payment.request.withdraw
    RB->>C: consume
    C->>PS: createWithdrawFromCommand(cmd)
    PS->>PS: validate withdrawTypes, resolve gateway,<br/>require beneficiaryIban/Name/Id
    PS->>PS: create PENDING payment (WD-XXXXXXXX) — no gateway call

    BE->>RB: publish payment.request.withdraw.approve (admin)
    RB->>C: consume
    C->>PS: approveWithdrawByExternalReference(ref, adminId)
    PS->>PS: guards: operation=WITHDRAW, gateway-bound, status=PENDING
    PS->>REG: getByCode
    PS->>G: gateway.withdraw({iban, beneficiary, reference})
    G-->>PS: _stan / ipgReference
    PS->>PS: status=PROCESSING, adminId set
    PS->>EV: payment.processing
```

## Admin RPC + symbol sync

```mermaid
flowchart TD
    A[goldex-backend] -->|symbol.sync| RB[(RabbitMQ)]
    RB --> S[SymbolSyncConsumer]
    S --> SY[SymbolsService.upsertFromSync]
    SY --> DB[(payment_symbols)]

    B[goldex-backend admin] -->|cbp.admin.request RPC| R2[RabbitMQ]
    R2 --> CA[CBPAdminConsumer]
    CA --> CAS[CBPAdminService<br/>actions: health/gateways/payments/payment]
    CAS --> DB2[(payments)]
    CAS -->|cbp.admin.response| R2
```

## Failure handling

```mermaid
flowchart LR
    Fail[Gateway error / symbol missing] --> Mark[payment.status = FAILED]
    Mark --> Ev[payment-events.failed publish payment.failed]
    Ev --> Ack[consumer acks to avoid poison redelivery loop]
```

> Conventions: identifiers prefixed `DP-` (deposit) / `WD-` (withdraw); events only emitted when `externalReference` is set; non-gateway types stay PENDING without provider call.
