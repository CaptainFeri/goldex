# Credit / Leveraged Trading — Implementation Handoff

**Document type:** Engineering Handoff / As-Built Technical Reference
**Version:** 1.0
**Date:** 2026-08-26
**Status:** Implementation reference — describes the code as it exists today.

> Related docs:
> - `credit_trading_engine_handoff.md` — original functional/design baseline (v0.1).
> - `credit-settlement-engine.md` — design & implementation plan for the settlement engine.
> - `../CREDIT-FLOW-GUIDE.md` — cross-repo (backend + panels) user-facing flow guide.

---

## 1. Executive Summary

The credit system lets a user freeze a **base-symbol asset** (e.g. XAU, USD) from a
DEPOSIT wallet as **collateral**, and instantly receive a leveraged trading facility
issued into dedicated **CREDIT wallets**:

- **BUY capacity** (credit currency, e.g. IRR) = `collateralValue × leverage`
- **SELL capacity** (base symbol, e.g. XAU) = `frozen amount × leverage`

Credit trades settle against CREDIT wallets (separate accounting domain from DEPOSIT
wallets), are continuously valued mark-to-market by a settlement engine, and the
facility is governed by two independent state machines (settlement timer + risk) and
a drawdown penalty threshold. Settlement releases surplus to DEPOSIT wallets and
consumes collateral for any deficit (full recourse for residual shortfall).

There are **two facility styles** that share one code path:

1. **Legacy / admin-created** (`createCredit`) — an admin grants a nominal credit
   line into chosen wallets, freezing material collateral. No leverage snapshot;
   settled by "void the line" semantics.
2. **Self-service / v2** (`requestCredit`) — the user freezes collateral and the
   leveraged capacity is computed and issued immediately at creation. Fully
   mark-to-market valued at settlement. This is the production path.

---

## 2. Architecture & Module Map

`CreditModule` (`src/credit/credit.module.ts`) wires everything together and imports
`UserLevelModule`, `WalletCoreModule` and `AdminScheduleModule`.

```text
src/credit/
├── credit.service.ts                 # Core facility lifecycle + admin ops + risk/timers
├── credit-cron.service.ts            # Scheduled jobs (reminders, timers, risk, pend deadlines)
├── credit.module.ts
├── admin/credit-admin.controller.ts  # /admin/credits API
├── user/credit-user.controller.ts    # /credits API
├── settlement/credit-settlement.service.ts  # Mark-to-market settlement / liquidation engine
├── entity/
│   ├── credit.entity.ts
│   ├── credit-order.entity.ts
│   └── credit-notification.entity.ts
├── enum/                             # CreditStatus, CreditOrderStatus, RiskState,
│                                     # SettlementState, PendDeadlineState, CreditEnforceMode,
│                                     # CreditNotificationType, CreditAction
├── dto/                              # create/request/settle/cancel/extend/query DTOs
└── util/pend-deadline.util.ts        # Per-pair request deadline computation
```

### 2.1 Key collaborators outside the module

| Service | Role in credit flow |
|---|---|
| `WalletOrderService` (`src/wallet/services/wallet-order.service.ts`) | Freezes/unlocks/confirms order balances on CREDIT wallets (`freezeForOrder`, `confirmOrderExecution`, `unlockOrder`, `rejectOrder`). `unlockOrder` is manager-scoped so the settlement engine releases balance atomically. |
| `OrderService` (`src/order/order.service.ts`) | `createOrder` resolves the active facility, applies credit guards, links the order, freezes capacity, publishes to provider. |
| `OrderStatusConsumer` (`src/rabbitmq/consumers/order-status.consumer.ts`) | Provider confirm/reject → completes or cancels credit orders, increments execution level. |
| `QuoteRequestService` (`src/quote-request/quote-request.service.ts`) | Mirrors order creation for the custom/offer market (same credit guards + wallet handling). |
| `UserLevelService` (`src/user-level/user-level.service.ts`) | Provides level credit config (`getUserLevel`, `getFeatureValue`). |
| `PricePairEntity` | Carries per-side pend-deadline hours (`buy/sellWarnHours`, `buy/sellExpireHours`, `buy/sellGraceHours`, `excludedDays`). |

---

## 3. Wallet Model — the Credit-Affected Wallet Domain

### 3.1 Wallet types (`WalletTypeEnum`)

| Type | Purpose | Withdrawable | Tradeable directly |
|---|---|---|---|
| `DEPOSIT` | Real user funds (debit wallet) | Yes | Yes (non-credit) |
| `CREDIT` | Issued credit capacity (IRR + base symbol) | No | Yes (credit) |
| `COLLATERAL` | Frozen collateral | No | No |

A v2 facility normally has **two CREDIT wallets**:
- CREDIT **IRR** wallet → `creditBalance` = BUY capacity (`creditLimit`).
- CREDIT **base-symbol** wallet → `creditBalance` = SELL capacity (`frozen × leverage`).

### 3.2 Wallet balance fields (`WalletEntity`)

| Field | Column | Meaning |
|---|---|---|
| `freeBalance` | `free_balance` | The spendable amount; the trade pages read this as "Available Buy/Sell". |
| `lockedBalance` | `locked_balance` | Amount locked by pending orders (freeze). |
| `creditBalance` | `credit_balance` | The issued capacity (constant per wallet); NOT read by order settlement. |
| `availableBalance` | `available_balance` | Supporting field used in credit-service reconciliation. |
| `frozenFreeBalance` / `frozenLockedBalance` | `frozen_free_balance` / `frozen_locked_balance` | Collateral freeze accounting (admin-created credits). |
| `status` | `status` | `ACTIVE`/`FROZEN`; non-ACTIVE throws `WALLET_FROZEN_CREDIT_EXPIRED`. |

Key invariant: **order settlement never reads `creditBalance`/`availableBalance`**.
The CREDIT wallet's `freeBalance` is the spendable amount. `creditBalance` is written
only at issue/top-up time (`credit.service.ts`) and zeroed at settlement
(`credit-settlement.service.ts`).

### 3.3 Credit-relevant transaction types (`TransactionTypeEnum`)

`CREDIT_DEPOSIT` (issue line / sell capacity / top-up), `CREDIT_WITHDRAWAL` (clawback on
cancel), `CREDIT_LIQUIDATION`, `CREDIT_SETTLEMENT` (settlement surplus/collateral),
`MATERIAL_FREEZE` / `MATERIAL_UNFREEZE` (collateral freeze/unfreeze), plus standard
`ORDER`, `ORDER_CANCEL`, `ORDER_REJECTED`, `BUY`, `SELL`.

---

## 4. Entities

### 4.1 `CreditEntity` (`credit` table)

The facility record. Extends `myBaseEntity` (id, created_at, updated_at, deleted_at).

- Identity: `userId`, `adminId` (nullable), `creditCode` (unique), `amount`.
- Status & lifecycle: `status`, `expireAt`, `activatedAt`, `settledAt`, `notes`,
  `settleImagePath`, `settledByAdminId`.
- Legacy guardrails: `hasCallMargin`, `callMarginPercent`, `reminderTimerHours`,
  `reminderLastSentAt`.
- Trade-chain caps: `maxExecutionTradeLevel`, `executedTradeLevel`,
  `maxConcurrentOrders`, `maxTradeChainDepth`, `currentTradeChainDepth`.
- **V2 facility fields**: `leverage`, `creditLimit`, `usedCredit`,
  `collateralSymbolId`, `collateralAmount`, `initialCollateralValue`,
  `currentCollateralValue`, `drawdownPercent`, `lastDrawdownPercent`,
  `creditBaseSymbolId`, `enforceOnDrawdown`, `enforceOnExpiry`,
  `enforceRequestDeadline`.
- State machines: `settlementState` (GREEN default), `riskState` (NORMAL default),
  `greenDurationHours` (8), `yellowDurationHours` (4), `redDurationHours` (4),
  plus the `settlementYellowAt/RedAt/AdminReviewAt` and `riskWarningAt/riskMarginCallAt`
  timestamps.
- Bad debt: `outstandingShortfall`, `isInDefault`.
- `metadata` jsonb — holds `creditWalletId`, `sellCreditWalletId`, `sellCreditAmount`,
  `sellCreditSymbolId`, `collateralWalletId`, `depositWalletId`,
  `maxParallelRequests`, `maxExecutionLevel`, `creditConfigs` (snapshot from level),
  `frozenMaterialSymbols`, `increasedWallets`, and the full settlement report
  (`metadata.settlement`).

### 4.2 `CreditOrderEntity` (`credit_order` table)

The link between a facility and an `OrderEntity` — the **single source of truth for
what the user borrowed/owns** at settlement.

- `creditId`, `orderId` (FKs, cascade), `priceAtOrderTime` (gram price),
  `drawdownPercent` (snapshot of `callMarginPercent`), `currentPrice`, `marginCalledAt`.
- Status: `ACTIVE | MARGIN_CALLED | COMPLETED | CANCELLED`.
- Trade-chain: `tradeChainLevel` (default 1), `tradeThreadId`, `parentCreditOrderId`.

Note: **`OrderEntity` has `isCreditLinked` but no `creditId` column** — the link lives
only in this join table. (See §8.4 dead code.)

### 4.3 `CreditNotificationEntity` (`credit_notification` table)

User-facing notifications: `userId`, `creditId`, `type`, `message`, `isRead`,
`readAt`, `sentAt`. Types: `REMINDER | MARGIN_CALL | EXPIRY_WARNING | SETTLEMENT | EXPIRED`.

---

## 5. Enums & State Machines

### 5.1 Credit status (`CreditStatusEnum`)
`PENDING | ACTIVE | SUSPENDED | SETTLED | EXPIRED | CANCELLED`

### 5.2 Settlement timer state (`SettlementStateEnum`)
`GREEN | YELLOW | RED | ADMIN_REVIEW | AUTO_LIQUIDATION | SETTLED`

Transition logic (`processSettlementTimers`, credit.service.ts:2229) — windows
measured from `activatedAt`:
- `GREEN` = `[0, greenDurationHours)`
- `YELLOW` = `[green, green+yellow)`
- `RED` = `[green+yellow, green+yellow+red)`
- `ADMIN_REVIEW` = beyond that.

Defaults 8h / 4h / 4h. Each transition stamps its `*At` timestamp and emits
`CreditEvents.SETTLEMENT_STATE_CHANGED`. `extendCredit` pushes `activatedAt` forward
and resets to GREEN.

### 5.3 Risk state (`RiskStateEnum`)
`NORMAL | WARNING | MARGIN_CALL | REDUCING | LIQUIDATING | LIQUIDATED | SETTLED | DEFAULT`

Evaluated every 5 min and at order time using `marginRatio = equity / exposure`:
- `marginRatio <= 0.075` → `MARGIN_CALL`
- `marginRatio <= 0.15` (from NORMAL) → `WARNING`
- `marginRatio > 0.15` (from WARNING) → back to `NORMAL`

**Reduce-only rule:** when `riskState` is `WARNING` or `MARGIN_CALL`, BUY
(exposure-increasing) orders are blocked; SELL allowed.

### 5.4 Pend-deadline state (`PendDeadlineStateEnum`)
`GREEN | YELLOW | RED | GRACE | CLOSED` — per-order deadline lifecycle for
credit-linked requests (see §7.5).

### 5.5 Enforce mode (`CreditEnforceModeEnum`)
`ENFORCE` (close the facility) | `ALERT` (notify + block BUY).

### 5.6 Credit actions (`CreditActionEnum`)
All facility/risk actions are journaled to `finance_log`:
`CREDIT_CREATED, CREDIT_ACTIVATED, CREDIT_SETTLED, CREDIT_EXPIRED, CREDIT_CANCELLED,
WALLET_FROZEN, WALLET_UNFROZEN, BALANCE_INCREASED, BALANCE_FROZEN_FOR_CREDIT,
BALANCE_UNFROZEN_FOR_CREDIT, MATERIAL_FREEZE, LIQUIDATION, ORDER_CANCELLED_MARGIN,
EXPIRY_FREEZE_ALL, USER_STATUS_CHANGED, ALL_WALLETS_FROZEN, REMINDER_SENT,
CREDIT_SUSPENDED, CREDIT_REACTIVATED, CREDIT_EXTENDED, CREDIT_LIMIT_ADJUSTED,
CREDIT_FORCE_LIQUIDATED`.

---

## 6. User-Level Credit Configuration

Credit config lives on `UserLevelEntity` in three layers (dedicated columns win,
`features` jsonb is fallback):

### 6.1 Level-level (default) fields

| Field | Meaning |
|---|---|
| `creditBaseSymbolId` | Credit currency (e.g. IRR). All level pairs must be quoted in it. |
| `creditMaxLeverage` | Max leverage. |
| `creditDrawdownPercent` | Drawdown penalty threshold (%). |
| `creditEnforceOnDrawdown` | `ENFORCE` / `ALERT`. |
| `creditEnforceOnExpiry` | `ENFORCE` / `ALERT` on settlement expiry. |
| `creditEnforceRequestDeadline` | Auto-close expired pend requests. |
| `creditMaxParallelRequests` | Concurrent pending credit requests cap. |
| `creditMaxExecutionLevel` | Max "hops" (completed credit trades). |
| `creditRequireKyc` | Default true — approved KYC required to open credit. |
| `creditTradingEnabled` | Default true — opt-out toggle (moved from features). |
| `creditMaxAmount` | Max credit amount (0/null = unlimited). |
| `creditMaxDurationDays` | Max facility duration (0/null = no expiry). |
| `creditConfigs` | jsonb `{ [pairId]: CreditPairConfig }` per-pair overrides. |

### 6.2 Per-pair overrides (`credit_configs`)

`creditConfigs[pairId]` can override for the traded pair: `creditTradingEnabled`,
`creditDrawdownPercent`, `creditEnforceOnDrawdown`, `creditMaxParallelRequests`,
`creditMaxExecutionLevel`. The order path resolves the **traded pair's** config first,
then the facility snapshot in `credit.metadata`, then `getFeatureValue`.

### 6.3 `getFeatureValue` return shapes (defensive normalization)

| Key | Shape |
|---|---|
| `CREDIT_TRADING_ENABLED` | boolean |
| `CREDIT_MAX_AMOUNT` | `{ amount, currency: "IRR" }` |
| `CREDIT_MAX_DURATION_DAYS` | number |

Consumers normalize with `typeof x === "object" ? x?.amount : Number(x)`.

### 6.4 Snapshot-at-creation

`requestCredit` copies the level's risk settings onto the facility (`drawdownPercent`,
`enforceOnDrawdown`, `enforceOnExpiry`, `enforceRequestDeadline`, and
`metadata.{maxParallelRequests, maxExecutionLevel, creditConfigs}`) so later level
edits do not retroactively change live facilities.

---

## 7. Flows

### 7.1 Admin create (legacy v1) — `CreditService.createCredit`

`POST /admin/credits` → `CreateCreditDto`:
1. User exists; `CREDIT_TRADING_ENABLED`; no existing ACTIVE or PENDING facility.
2. Total amount = sum of `increasedWallets[].amount`, else `amount`.
3. Enforce `CREDIT_MAX_AMOUNT`.
4. **Freeze collateral**: if `frozenWallets[]` given, freeze those amounts from DEPOSIT
   wallets (`frozenFreeBalance += x`, `freeBalance -= x`, `MATERIAL_FREEZE` txn). If
   omitted, freeze **all available material** in active DEPOSIT wallets.
5. **Issue the line**: add `amount` to each increase wallet's `creditBalance`
   (`freeBalance = availableBalance + creditBalance`, `CREDIT_DEPOSIT` txn).
6. Create facility `ACTIVE` with durations, call-margin, trade-chain caps, and
   `metadata.{frozenMaterialSymbols, creditWalletId, increasedWallets}`.

### 7.2 Self-service request (v2) — `CreditService.requestCredit`

`POST /credits/request` → `RequestCreditDto { depositWalletId, amount, leverage }`,
single transaction:

1. Guards: `CREDIT_TRADING_ENABLED`; level has `creditBaseSymbolId`; KYC approved
   unless `creditRequireKyc === false`; `leverage ≤ creditMaxLeverage`;
   `amount > 0`; no existing ACTIVE facility; deposit wallet exists/active/DEPOSIT.
2. **Collateral restriction** — deposit wallet symbol must be a **base symbol** of the
   level's pairs (XAU/IRR → XAU, USD/IRR → USD). Users freeze only base symbols.
3. Price the collateral against the credit base symbol (`bestSellGramPrice`); symbols
   denominated directly in the base map to price 1. No active pair → `CREDIT_NO_PRICE`.
4. `CREDIT_MAX_AMOUNT` enforced against projected credit `amount × price × leverage`;
   `CREDIT_MAX_DURATION_DAYS` caps `expireAt` (default: no expiry).
5. **Freeze** — `amount` moves DEPOSIT → COLLATERAL wallet (`MATERIAL_FREEZE` txn).
   `initialCollateralValue = amount × price` (the drawdown baseline).
6. **Issue immediately**:
   - `creditLimit = collateralValue × leverage` → CREDIT IRR wallet `creditBalance`.
   - `sellCreditAmount = amount × leverage` → CREDIT base wallet `creditBalance`.
   - Facility `ACTIVE`, `metadata` carries wallet IDs and the level config snapshot.
7. `SETTLEMENT` notification created.

### 7.3 Credit calculation on first order

`CreditService.calculateAndIssueCreditOnFirstOrder(creditId, pricePairId)` — for the
case where the line wasn't issued at creation (price unavailable then): recomputes
`creditLimit = collateralAmount × price × leverage` at the **current** pair price and
issues BUY + SELL capacity. No-op when `creditLimit > 0` already or for legacy
facilities (no collateral/leverage snapshot). `ensureSellCreditCapacity` idempotently
tops up the SELL capacity to `amount × leverage` (safety net so credit SELL orders
never fail with `INSUFFICIENT_BALANCE`).

### 7.4 Credit trading (order path)

`OrderService.createOrder` (and the quote-request mirror) when `useCredit !== false`
and an active facility exists:

1. `isCreditLinked = true`; `pricePair` resolved.
2. If `creditLimit === 0` → `calculateAndIssueCreditOnFirstOrder`; reload credit.
3. SELL side → `ensureSellCreditCapacity`.
4. Guard stack (each throws a distinct error):
   - per-pair `creditTradingEnabled` → `CREDIT_TRADING_DISABLED`
   - open-position cap `maxExecutionTradeLevel` (counts ACTIVE credit orders) →
     `CREDIT_EXECUTION_LIMIT_REACHED`
   - parallel cap `creditMaxParallelRequests` (active + pending linked orders) →
     `CREDIT_MAX_PARALLEL_REQUESTS_REACHED`
   - hops cap `creditMaxExecutionLevel` (COMPLETED credit orders) →
     `CREDIT_MAX_EXECUTION_LEVEL_REACHED`
   - drawdown → `CREDIT_DRAWDOWN_BLOCKED`
   - reduce-only (WARNING/MARGIN_CALL) → `CREDIT_REDUCE_ONLY`
   - BUY capacity `requiredCredit = qty × displayGram` vs
     `availableCredit = creditLimit − computeUsedCredit(creditId)` →
     `CREDIT_INSUFFICIENT_AVAILABLE`
5. Pend deadlines stamped from the pair's per-side hours (`computePendDeadlines`).
6. Order created with `price = displayGram` (customer price), `customerPrice =
   displayGram`, `mesghalPrice = provider mesghal pure price`, `isCreditLinked`.
7. `freezeForOrder` locks the CREDIT wallet:
   - BUY locks `qty × customerPrice` from CREDIT IRR `freeBalance → lockedBalance`.
   - SELL locks `qty` from CREDIT base `freeBalance → lockedBalance`.
   - Insufficient free → `INSUFFICIENT_BALANCE`; order rejected, never counts.
8. Bookkeeping: `credit.usedCredit += qty × displayGram`; a `CreditOrderEntity`
   (`ACTIVE`) is created (this is the live linking path).
9. MARKET/QUOTE → provider (`ORDER_PLACE_REQUEST`) at pure `mesghalPrice`; LIMIT →
   order book.

**Execution** (`confirmOrderExecution` + `OrderStatusConsumer`):
- BUY: quote `lockedBalance` debited by `totalCost + commission`; base `freeBalance`
  credited full qty (provider margin handled as system profit in XAU or IRR depending
  on order type).
- SELL: base `lockedBalance` debited full qty; quote `freeBalance` credited
  `qty × purePrice` (commission taken in gold).
- On confirm → credit order `COMPLETED`, `executedTradeLevel++`.
- On reject → `rejectOrder` unlocks, credit order `CANCELLED`, no hop counted.

**Balance semantics (user-facing):**
- Available Buy (IRR) = CREDIT IRR `freeBalance`.
- Available Sell (base) = CREDIT base `freeBalance`.
- Used = `creditBalance − freeBalance − lockedBalance`.
- Available credit (formula) = `creditLimit − Σ(completed credit order value)`.

### 7.5 Pend deadlines & request expiry

`computePendDeadlines` (util/pend-deadline.util.ts) computes `warnAt`, `expireAt`,
`graceEndAt` from the pair's per-side `buy/sell{Warn,Expire,Grace}Hours`, skipping
`excludedDays` (e.g. Friday). Sweep `processPendDeadlines` (every 5 min) transitions
`GREEN → RED → GRACE → CLOSED`. On `CLOSED` + `PENDING` + `enforceRequestDeadline`,
the order is cancelled via `walletOrderService.rejectOrder(...CANCELLED)` and its
`CreditOrderEntity` → `CANCELLED` (frozen credit balance released).

### 7.6 Settlement / liquidation — the settlement engine

**`CreditSettlementService`** (`src/credit/settlement/credit-settlement.service.ts`)
is the single, idempotent entry point for all closing paths. Modes:
`USER_SELF | ADMIN | DRAWDOWN | MARGIN_CALL | EXPIRY | FORCE`.

`settleCredit(creditId, opts)`:
1. Pessimistic-lock the facility; guard status `ACTIVE | SUSPENDED | EXPIRED`.
2. Legacy facilities (no collateral/leverage snapshot) → `settleLegacyCredit`: void
   the line, unfreeze deposit collateral, record residual for review.
3. Resolve mark price (`bestSellGramPrice` of collateral vs credit base); abort
   `CREDIT_NO_MARK_PRICE` (defer, never guess).
4. Cancel open PENDING/PARTIALLY_COMPLETED credit orders via
   `walletOrderService.unlockOrder(manager, ...)` **inside the same transaction**.
5. `computeState` — value the **actual** economic position from executed credit
   orders (`computeFromOrders`):
   - BUY: `borrowedIr += qty × order.price`; `netXau += qty × (1 − buyComm/100)`.
   - SELL: `sellRevenueIr += qty × purePrice`; `netXau −= qty`.
   - `netIr = sellRevenueIr − borrowedIr`.
   - `collateralValue = collateralAmount × markPrice`.
   - `exposure = borrowedIr + Σ(borrowedXau × markPrice)`.
   - `equity = collateralValue + netEquity`; `marginRatio = equity/exposure`.
   - `resolveResult`: offset base positions against IRR; compute `releaseIr`,
     `releaseXau`, `deficit = max(0, −netEquity)`, `consumedCollateral`, `shortfall`.
6. `USER_SELF`: allow covering a deficit from the DEPOSIT IRR wallet before
   collateral is consumed.
7. Zero all CREDIT wallets (credit line removed).
8. Release surplus (`releaseIr`, `releaseXau`) to DEPOSIT wallets (`CREDIT_SETTLEMENT`
   txns).
9. `applyCollateral`: consume COLLATERAL for the deficit; return the remainder to the
   DEPOSIT wallet; residual uncovered → `shortfall`, facility → `DEFAULT`
   (`isInDefault`, `outstandingShortfall`).
10. Mark `SETTLED`; store the full settlement report in `metadata.settlement`;
    finance log + notification + `CreditEvents.SETTLED`.

`liquidate(creditId, reason, opts)` = `settleCredit` with `mode: FORCE` and
`allowDepositTopUp: false`. **Liquidation cash-settles at the mark price; it does not
create a real provider close order.**

### 7.7 Drawdown enforcement

`recomputeDrawdown` computes an **equity-based** drawdown:
```
drawdown% = max(0, initialCollateralValue − equity) / initialCollateralValue × 100
equity    = currentCollateralValue + net credit-trade PnL (mark-to-market)
```
Checked at **order time** (`enforceDrawdownRules`) and by the **risk cron**:
- `drawdown% ≥ creditDrawdownPercent` and `ENFORCE` → `liquidateForDrawdown`
  (settlement engine closes; loss from collateral; remainder refunded).
- `ALERT` → notify + block BUY orders.

### 7.8 Margin call

- **Per-order** (`checkOrderMarginCall`): for facilities with `hasCallMargin`, a price
  move of `callMarginPercent`% vs `priceAtOrderTime` marks the credit order
  `MARGIN_CALLED`, blocks the user's wallets, and cancels the open order (partial
  refunds to the Rial DEPOSIT wallet).
- **Credit-level** (`checkIncreaseWalletMarginCall`): re-values increase wallets
  against their creation price; breaching threshold force-liquidates the credit.
- Triggered by `CreditEvents.PRICE_UPDATE` (emitted by the price pipeline) →
  `handlePriceUpdate` → `processMarginCallChecks`.

### 7.9 Expiry

`processExpiredCredits` (cron currently commented out) liquidates via the settlement
engine (`EXPIRY_LIQUIDATION`) then **freezes all the user's wallets**. Reminders are
sent hourly within `reminderTimerHours` of `expireAt` (`sendReminderNotifications`).

---

## 8. Admin Management (`/admin/credits`)

All routes `AdminAuthGuard` + `AdminWorkTimeGuard`, roles
`FINANCE | SUPER_ADMIN | ADMIN`.

| Action | Endpoint | Service method |
|---|---|---|
| Create (admin override) | `POST /admin/credits` | `createCredit` |
| List / filter / paginate | `GET /admin/credits` | `getAllCredits` |
| Dashboard KPIs | `GET /admin/credits/stats` | `getCreditStats` |
| Detail + orders | `GET /admin/credits/:id` | `getCreditById` |
| Enhanced risk view | `GET /admin/credits/:id/risk` | `getCreditRisk` (live `computeState`) |
| PnL | `GET /admin/credits/:id/pnl` | `calculateCreditPnL` |
| By user + active overview | `GET /admin/credits/user/:userId` | `getUserCreditsAdmin` |
| Settle | `POST /admin/credits/:id/settle` | `settleCredit` (mode `ADMIN`) |
| Force-liquidate | `POST /admin/credits/:id/liquidate` | `forceLiquidateCredit` |
| Cancel (claw back + unfreeze) | `POST /admin/credits/:id/cancel` | `cancelCredit` |
| Suspend (freeze user wallets) | `POST /admin/credits/:id/suspend` | `suspendCredit` |
| Reactivate (unfreeze) | `POST /admin/credits/:id/reactivate` | `reactivateCredit` |
| Extend settlement timer | `POST /admin/credits/:id/extend` | `extendCredit` |
| Adjust credit limit | `POST /admin/credits/:id/adjust-limit` | `adjustCreditLimit` |
| CSV export | `GET /admin/credits/export` | `exportCreditsCsv` |

Admin settle/liquidate always restores the user's wallets
(`unfreezeWalletsAfterSettlement`). `cancelCredit` claws back the increase-wallet
`creditBalance` (`CREDIT_WITHDRAWAL`) **before** unfreezing collateral. `suspendCredit`
blocks all wallets; `reactivateCredit` restores ACTIVE.

## 9. User Endpoints (`/credits`)

`UserAuthGuard` + `UserLevelGuard`, bearer.

| Endpoint | Purpose |
|---|---|
| `POST /credits/request` | Open self-service facility |
| `POST /credits/:id/settle` | Self-settle (deposit top-up allowed) |
| `GET /credits/active` | Active facility |
| `GET /credits/overview` | Live used/available, collateral, states, balances |
| `GET /credits` | History |
| `GET /credits/notifications` | Notifications |
| `PATCH /credits/notifications/:id/read` | Mark read |

---

## 10. Cron Jobs (`CreditCronService`)

| Schedule | Job | Behavior |
|---|---|---|
| every hour | `handleReminders` | Expiry reminder notifications |
| every 10 min | `handleSettlementTimers` | GREEN/YELLOW/RED/ADMIN_REVIEW transitions |
| every 5 min | `handleRiskStateTransitions` | Risk state + drawdown enforcement |
| every 5 min | `handlePendDeadlines` | Pend-deadline sweep for credit-linked orders |
| (commented) | `processExpiredCredits` | Expiry liquidation + wallet freeze |

## 11. Events (`CreditEvents`)

`credit.expired`, `credit.margin_call`, `credit.settled`, `credit.reminder`,
`credit.price_update` (consumed for margin checks), `credit.settlement_state_changed`,
`credit.risk_state_changed`.

---

## 12. Schema Evolution (migrations)

| Migration | Adds |
|---|---|
| `0057` | `credit`, `credit_order`, `credit_notification`, `finance_log`, `admin_schedule` + enums + CREDIT_* txn types |
| `0059` | `user_level` table + seeds (features jsonb with `CREDIT_MAX_AMOUNT`, `CREDIT_MAX_DURATION_DAYS`) |
| `0060` | `credit.max_execution_trade_level`, `credit.executed_trade_level` |
| `0079` | `user_level_pairs` join + USD/IRR pair + role reseed (gold-retail, dollar-seller, gold-wholesale, mediator) |
| `0080` | `wallet.available_balance/credit_balance`; trade-chain cols; `settlement_state`/`risk_state` + durations; bad-debt cols |
| `0081` | Wallet type separation (`DEPOSIT/CREDIT/COLLATERAL`), legacy credit split into CREDIT rows; user_level credit-v2 columns; price-pair pend-deadline hours; order/quote_request pend-deadline cols; credit v2 facility fields |
| `0082` | `SUSPENDED` credit status + new finance actions |
| `0083` | `user_level.credit_require_kyc` (default true) |
| `0084` | `credit_trading_enabled`, `credit_max_amount`, `credit_max_duration_days`, `credit_configs` jsonb |

---

## 13. Known Issues / Gotchas for the next engineer

1. **Dead code:** `CreditService.linkOrderToCredit` (credit.service.ts:898) has **zero
   callers** — the live linking is the inline `CreditOrderEntity` creation in
   `order.service.ts` (`createOrder`).
2. **Price naming mismatch:** `order.entity.ts` documents `price` as the pure per-gram
   price, but `order.service.ts` sets `price = displayGram` (customer price). The pure
   price lives only in `mesghalPrice`. The settlement engine deliberately reads
   `order.price` for BUY (what the customer was charged) and `mesghalPrice / MESQAL_TO_GRAM`
   for SELL (what the user was credited) — do not "fix" one without the other.
3. **Settlement cancels open orders via `unlockOrder` inside the settlement
   transaction** — the CREDIT wallets are zeroed anyway, so a partially-frozen lock
   that fails to release is still fine (settlement zeroes the wallet).
4. **Drawdown is equity-based**, not purely collateral-price-based. It also reacts to
   credit-trade PnL. Keep the settlement-engine `computeState` as the single valuation
   source — `recomputeDrawdown` and the risk cron both use it.
5. **`CREDIT_MAX_AMOUNT` returns `{amount, currency}`; other credit feature keys return
   scalars.** Always normalize via the object-or-scalar guard before comparing.
6. **Legacy admin credits have no `creditLimit`/leverage semantics** — they take the
   `settleLegacyCredit` path, not mark-to-market. `ensureSellCreditCapacity` returns 0
   for them.
7. **Cron `processExpiredCredits` is currently disabled** (commented out) — credits do
   not auto-close on expiry by default; expiry enforcement is `enforceOnExpiry`-driven
   and expiry currently just freezes wallets if the job is enabled.
8. **Risk thresholds (WARNING 15%, MARGIN_CALL 7.5%) are hard-coded** in
   `evaluateRiskState` — not yet level-configurable.
9. **Liquidation is cash-settled**, not a real provider close order — consistent with
   the settlement-engine design doc, but it means slippage/gap risk is absorbed at the
   mark price at liquidation time.

---

## 14. File Map

**Credit module**
- `src/credit/credit.service.ts` — lifecycle, guards, admin ops, risk/timer state machines.
- `src/credit/credit-cron.service.ts` — scheduled jobs.
- `src/credit/settlement/credit-settlement.service.ts` — mark-to-market settlement/liquidation.
- `src/credit/credit.module.ts`
- `src/credit/admin/credit-admin.controller.ts`
- `src/credit/user/credit-user.controller.ts`
- `src/credit/entity/*`, `src/credit/enum/*`, `src/credit/dto/*`, `src/credit/util/pend-deadline.util.ts`

**Collaborators**
- `src/order/order.service.ts` — credit-linked order creation + guards.
- `src/order/admin/admin-order.service.ts` — admin order ops + execution-level increments.
- `src/wallet/services/wallet-order.service.ts` — freeze/confirm/unlock on CREDIT wallets.
- `src/wallet/entities/wallet.entity.ts`, `src/wallet/enum/{wallet-type,transaction.type}.enum.ts`
- `src/rabbitmq/consumers/order-status.consumer.ts` — provider confirm/reject → credit orders.
- `src/quote-request/quote-request.service.ts` — custom/offer-market credit path.
- `src/user-level/user-level.service.ts` + entity/DTOs — credit config.
- `src/admin-pair/entity/price.pair.entity.ts` + `admin-pair.service.ts` — pend-deadline config + dashboard state.
- `src/shared/constants/events.constants.ts` — `CreditEvents`.
- Migrations `0057`–`0084` in `src/migrations/`.