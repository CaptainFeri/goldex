# Goldex Credit System — Complete Flow Guide

**Version:** 1.0  
**Date:** 2026-08-25  
**Scope:** The full credit (leveraged collateral) lifecycle across admin configuration, user credit creation, trading, settlement, rejections and drawdown enforcement — as implemented in `goldex-backend`, `goldex-user-panel` and `goldex-admin-panel`.

---

## 1. Overview

A user freezes a **base-symbol asset** (e.g. XAU, USD) from a deposit wallet as collateral and instantly receives a leveraged credit facility. The credit is issued **immediately at creation**:

- **BUY capacity** (in the credit currency, e.g. IRR) = `collateralValue × leverage`
- **SELL capacity** (in the base symbol, e.g. XAU) = `frozen amount × leverage`

All credit trades settle against dedicated **CREDIT wallets**, separate from the user's **DEPOSIT** (debit) and **COLLATERAL** wallets.

> Example: user freezes **50g XAU** at **XAU/IRR = 10** with **leverage 5**:
> - Collateral value = `50 × 10 = 500 IRR`
> - BUY capacity = `500 × 5 = 2,500 IRR`
> - SELL capacity = `50 × 5 = 250 XAU`

---

## 2. Architecture

### 2.1 Wallet types (`WalletEntity.walletType`)
| Type | Purpose | Withdrawable | Tradeable directly |
|---|---|---|---|
| `DEPOSIT` | Real user funds (debit wallet) | Yes | Yes (non-credit) |
| `CREDIT` | Credit capacity (IRR + base symbol) | No | Yes (credit) |
| `COLLATERAL` | Frozen collateral | No | No |

A credit facility normally has **two CREDIT wallets**:
- CREDIT **IRR** wallet → `creditBalance` = BUY capacity (creditLimit).
- CREDIT **base-symbol** wallet → `creditBalance` = SELL capacity (`freeze × leverage`).

Wallet fields used by the credit engine:
- `freeBalance` — the **available** amount (the field the trade pages read for "Available Buy/Sell").
- `lockedBalance` — amount locked by pending orders.
- `creditBalance` — the issued capacity (constant per wallet).
- `availableBalance` / `frozenFreeBalance` / `frozenLockedBalance` — supporting fields.

`Available = freeBalance`, `Used = creditBalance − freeBalance − lockedBalance`.

### 2.2 Core entities
| Entity | Role |
|---|---|
| `CreditEntity` | The facility (leverage, limits, collateral, states, snapshot). |
| `CreditOrderEntity` | Link between a credit facility and an `OrderEntity`; drives settlement. |
| `WalletEntity` | Deposit / Credit / Collateral balances. |
| `OrderEntity` | The trade; `isCreditLinked` marks credit orders. |
| `UserLevelEntity` | Credit config: level-level defaults + per-pair `creditConfigs`. |

### 2.3 Key services
- `CreditService` — request/create, overview, limits, drawdown, margin checks, admin ops.
- `CreditSettlementService` — idempotent mark-to-market settlement / liquidation.
- `WalletOrderService` — freeze, confirm, unlock credit order balances.
- `OrderStatusConsumer` — provider confirmations → complete credit orders.
- `CreditCronService` — settlement timers, risk state, pend deadlines, reminders.

---

## 3. Flow 1 — Admin configuration

### 3.1 User-level credit config (`goldex-admin-panel` → Levels)
Each **user level** defines credit defaults, plus an optional **per-pair** structure:

Level-level (default) fields:
| Field | Meaning |
|---|---|
| `creditBaseSymbolId` | Credit currency (default, from selected pairs) |
| `creditMaxLeverage` | Max leverage |
| `creditDrawdownPercent` | Drawdown (penalty) threshold % |
| `creditEnforceOnDrawdown` | `ENFORCE` (close) / `ALERT` (notify+block) |
| `creditEnforceOnExpiry` | `ENFORCE` / `ALERT` on settlement expiry |
| `creditEnforceRequestDeadline` | Auto-close expired pend requests |
| `creditMaxParallelRequests` | Concurrent pending credit requests |
| `creditMaxExecutionLevel` | Max hops (completed credit trades) |
| `creditRequireKyc` | KYC required to open credit |
| `creditTradingEnabled` | Credit trading allowed (moved from features) |
| `creditMaxAmount` | Max credit amount (moved from features) |
| `creditMaxDurationDays` | Max credit duration (moved from features) |

Per-pair `creditConfigs[pairId]` — the same fields scoped to one selected price pair (credit base auto = the pair's quote). The order flow resolves the **traded pair's** config and overrides the defaults for `creditTradingEnabled`, `creditDrawdownPercent`, `creditEnforceOnDrawdown`, `creditMaxParallelRequests`, `creditMaxExecutionLevel`.

The **credit currency** dropdown is derived from the **selected pairs' quote symbols** (deduplicated) — selecting only `XAU/IRR` shows `IRR` once.

> Moved keys: `CREDIT_TRADING_ENABLED`, `CREDIT_MAX_AMOUNT`, `CREDIT_MAX_DURATION_DAYS` were removed from the level `features` jsonb and now live in dedicated columns; `getFeatureValue` reads the column first with a features fallback for existing levels.

### 3.2 Admin credit management (`goldex-admin-panel` → Credits)
| Action | Endpoint |
|---|---|
| Create (admin override) | `POST /admin/credits` |
| List / filter / paginate | `GET /admin/credits` |
| Dashboard KPIs | `GET /admin/credits/stats` |
| Detail + orders | `GET /admin/credits/:id` |
| Enhanced risk view | `GET /admin/credits/:id/risk` |
| PnL | `GET /admin/credits/:id/pnl` |
| By user | `GET /admin/credits/user/:userId` |
| Settle | `POST /admin/credits/:id/settle` |
| Force-liquidate | `POST /admin/credits/:id/liquidate` |
| Cancel | `POST /admin/credits/:id/cancel` |
| Suspend / reactivate | `POST /admin/credits/:id/suspend` / `.../reactivate` |
| Extend settlement | `POST /admin/credits/:id/extend` |
| Adjust limit | `POST /admin/credits/:id/adjust-limit` |
| CSV export | `GET /admin/credits/export` |

---

## 4. Flow 2 — User creates credit

**Endpoint:** `POST /credits/request` `{ depositWalletId, amount, leverage }`

Steps (single transaction):
1. **Guards**
   - KYC approved, unless the level sets `creditRequireKyc: false`.
   - Leverage ≤ level `creditMaxLeverage`.
   - `CREDIT_MAX_AMOUNT` enforced against projected credit (`amount × price × leverage`).
   - `CREDIT_MAX_DURATION_DAYS` caps `expireAt` (default: no expiry).
   - No existing ACTIVE credit.
2. **Collateral restriction** — the deposit wallet's symbol must be a **base symbol** of the level's pairs (e.g. XAU/IRR → XAU, XAU/USD → XAU, USD/IRR → USD). Users can only freeze XAU / USD in those examples.
3. **Freeze** — `amount` moves from the DEPOSIT wallet to a COLLATERAL wallet (transaction `MATERIAL_FREEZE`).
4. **Value** — `initialCollateralValue = amount × current price` (the drawdown baseline; 50g × 10 = 500 IRR).
5. **Issue immediately** (same transaction):
   - CREDIT IRR wallet: `creditBalance = creditLimit = collateralValue × leverage`.
   - CREDIT base wallet: `creditBalance = sellCapacity = amount × leverage`.
   - Facility `CreditEntity` created `ACTIVE` with the level's config snapshot + `creditConfigs`.
6. Notification created; user sees the credit instantly.

**User endpoints**
| Endpoint | Purpose |
|---|---|
| `POST /credits/request` | Open facility |
| `POST /credits/:id/settle` | User self-settle (deposit top-up allowed) |
| `GET /credits/active` | Active facility |
| `GET /credits/overview` | Live used/available, collateral, states, balances |
| `GET /credits` | History |
| `GET /credits/notifications` | Notifications |
| `PATCH /credits/notifications/:id/read` | Mark read |

---

## 5. Flow 3 — Using credit (trading)

The trade pages (MARKET, LIMIT, QUOTE, and the Offer/custom request) let a credit-holder choose **credit** or **deposit** via a `useCredit` flag. Only when `useCredit` is true is an order credit-linked (`isCreditLinked = true`) and settles against CREDIT wallets.

### Order lifecycle
1. **Validation** (`OrderService.createOrder`): trading enabled (per-pair wins), max open positions, parallel cap, hops cap (`maxExecutionLevel`, counts **completed** orders only), drawdown check, reduce-only in WARNING/MARGIN_CALL.
2. **Freeze** (`WalletOrderService.freezeForOrder`): the order amount moves CREDIT `freeBalance → lockedBalance`.
   - BUY locks `qty × customerPrice` from CREDIT IRR.
   - SELL locks `qty` from CREDIT base.
   - Insufficient `freeBalance` → `INSUFFICIENT_BALANCE` (order rejected, never counts against limits).
3. **Link** — a `CreditOrderEntity` (status `ACTIVE`) is created.
4. **Execution**
   - MARKET/QUOTE → provider → `OrderStatusConsumer` confirms → `confirmOrderExecution` settles wallets + marks credit order `COMPLETED`.
   - LIMIT → order book → `settleLimitMatch` settles; on full fill marks `COMPLETED`.
   - On completion the credit order becomes `COMPLETED` and `executedTradeLevel` increments by **1**.
5. **Cancelled / rejected** → credit order becomes `CANCELLED`; locked balance released; **no** execution-level increment.

### Balance semantics (user-facing)
- **Available Buy (IRR)** = CREDIT IRR `freeBalance` (decreases on BUY freeze/completion, increases on SELL revenue).
- **Available Sell (base)** = CREDIT base `freeBalance` (decreases on SELL, increases on BUY).
- **Used** = `creditBalance − freeBalance − lockedBalance`.
- **Available credit (formula)** = `creditLimit − (value of all completed credit orders)`.
- The trade ticket charges BUY at the **display (customer) price**; SELL revenue is at the **pure** price (commission taken in gold).
- Pending orders **lock** the amount and reduce the wallet capacity immediately; cancel/reject restores it.

---

## 6. Flow 4 — Settlement

**Engine:** `CreditSettlementService.settleCredit` — idempotent, atomic (pessimistic lock + status guard).

Modes: `USER_SELF`, `ADMIN`, `DRAWDOWN`, `MARGIN_CALL`, `EXPIRY`, `FORCE`.

1. Cancel/release open credit orders (unlock).
2. **Value the actual position** at mark price (`computeState`):
   - `borrowedIr` (BUY cost), `sellRevenueIr` (SELL proceeds), `netIr`.
   - Per-base-symbol net position (`netXau`).
   - `equity = collateralValue + netEquity`.
   - `deficit = max(0, −netEquity)`, `consumedCollateral`, `shortfall`.
3. **USER_SELF**: allow covering a deficit from the DEPOSIT IRR wallet before collateral is consumed.
4. **Zero the CREDIT wallets** (credit line removed).
5. **Release surplus**: net IRR and net base assets go to the DEPOSIT wallets.
6. **Collateral application** (`applyCollateral`):
   - Deficit → consume from the COLLATERAL wallet (the loss is deducted from the frozen amount).
   - Any remaining collateral → refunded to the DEPOSIT (debit) wallet.
   - Residual uncovered deficit → `shortfall` (credit enters DEFAULT).
7. Facility → `SETTLED`; metadata records the full settlement report; notifications + events emitted.

> This is exactly the "close the credit, calculate the loss, decrease from the frozen amount, and return any remaining XAU to the user's debit wallet" behaviour.

**Legacy (admin-created, no collateral/leverage snapshot):** voids the credit line, returns frozen material collateral, leaves residual for admin review.

---

## 6b. Flow 4b — Cash-out (utilised credit, facility stays open)

A credit holder has **two ways out** of a credit purchase:

| Option | What happens |
|---|---|
| **1. Cash out the utilised credit** | One purchase made with credit is paid off and becomes a fully-paid holding. The facility stays `ACTIVE`. |
| **2. Settle and close** | The whole facility is valued, closed and the collateral returned (Flow 4 above). |

**Endpoints (user):** `GET /credits/:id/cashout-options`, `POST /credits/:id/cashout`, `GET /credits/:id/cashouts`.
**Endpoints (admin):** the same three under `/admin/credits/:id/…` (an admin can cash out on the user's behalf).

**Engine:** `CreditCashoutService.cashout` — atomic, one credit trade at a time.

1. Only a **completed credit BUY** still belonging to the facility can be cashed out (a short position must go through settlement).
2. The purchase is priced exactly as it was settled: `amount = executedQty × price` (plus the IRR commission for QUOTE buys), and the asset released is what actually landed in the CREDIT wallet (`qty × (1 − buyCommission%)`, or the full qty for QUOTE).
3. The user pays `amount + cash-out fee` from one of two sources:
   - **`DEPOSIT`** — debited from the DEPOSIT wallet in the credit currency.
   - **`COLLATERAL`** — the equivalent units are consumed from the frozen collateral at the current mark price (only collateral not backing an open trade; blocked in MARGIN_CALL / default).
4. The purchased asset moves **CREDIT → DEPOSIT**; the repaid `amount` returns to the CREDIT wallet's free balance (available credit goes back up).
5. Paying from collateral **shrinks the facility proportionally**: `ratio = consumedUnits / collateralAmount` removes `ratio × creditLimit` of BUY capacity and `ratio × sellCapacity` of SELL capacity, and reduces `collateralAmount`, `initialCollateralValue` (so the drawdown baseline stays honest) and `currentCollateralValue`. The reduction is rejected if it would push a credit wallet negative.
6. The trade becomes `CASHED_OUT` and leaves the facility entirely: the settlement engine, the used-credit sums and the drawdown all skip it, and its collateral lock is released.

### System profit
| Source | Booked as | Unit |
|---|---|---|
| Cash-out fee (`credit.cashoutFeePercent`, admin-managed per facility) | `SystemLedgerType.CREDIT_CASHOUT_FEE` | credit currency |
| Collateral conversion commission (pair `sellCommission`, only for the COLLATERAL source) | `SystemLedgerType.CREDIT_CASHOUT_SPREAD` | collateral units |

Both are stored on the `credit_cashout` row (`feeAmount`, `spreadProfit`, `systemProfitValue`), aggregated per facility in the admin credit detail's **cash-out tab** — where the fee rate is edited — and platform-wide in `GET /admin/credits/stats` (`cashout`), shown as dashboard KPIs.

---

## 7. Flow 5 — Rejection / Cancellation

- **Create-time failure** (e.g. freeze fails): order → `REJECTED`, its credit order → `CANCELLED`, locked balance released, no hop counted, no used-credit change.
- **Provider failure** (`OrderStatusConsumer`): `rejectOrder` unlocks the balance; credit order → `CANCELLED`.
- **User/admin cancel**: same release semantics.
- **Pend-deadline expiry** (`processPendDeadlines`): overdue credit-linked requests auto-cancel (when `creditEnforceRequestDeadline`) and the frozen credit balance is released.
- Rejected/cancelled orders **never** count toward `CREDIT_MAX_EXECUTION_LEVEL` (hops) or `maxExecutionTradeLevel`.

---

## 8. Flow 6 — Drawdown

Drawdown is **equity-based**: it reflects both collateral depreciation and credit-trade PnL.

```
drawdown% = max(0, initialCollateralValue − equity) / initialCollateralValue × 100
equity     = currentCollateralValue + net credit-trade PnL (mark-to-market)
```

Baseline `initialCollateralValue = frozen amount × price at creation` (50g × 10 = 500 IRR).

### Enforcement
Checked at **order time** and by the **risk cron** (every 5 min):
- If `drawdown% ≥ creditDrawdownPercent` (the penalty threshold):
  - **ENFORCE** → `liquidateForDrawdown` → settlement engine closes the credit, **calculates the loss, deducts it from the frozen collateral, refunds the remainder to the deposit wallet**.
  - **ALERT** → notify the user and block exposure-increasing (BUY) orders.
- The drawdown threshold and reaction are configurable per level and per pair.

### Risk state machine (independent of settlement state)
`NORMAL → WARNING (≤15% margin) → MARGIN_CALL (≤7.5%) → …`, reduce-only when WARNING/MARGIN_CALL.

---

## 9. Formulas summary

| Quantity | Formula |
|---|---|
| Collateral value | `frozen amount × price` |
| BUY capacity (creditLimit) | `collateralValue × leverage` |
| SELL capacity | `frozen amount × leverage` |
| Available buy (IRR) | CREDIT IRR `freeBalance` |
| Available sell (base) | CREDIT base `freeBalance` |
| Used | `creditBalance − freeBalance − lockedBalance` |
| Available credit | `creditLimit − Σ(completed credit orders value)` |
| Drawdown % | `max(0, initial − equity) / initial × 100` |
| Hops used | count of `COMPLETED` credit orders |

---

## 10. Invariants

1. `usedCredit ≤ creditLimit` (BUY guard + wallet freeze enforce this atomically).
2. Credit SELL cannot exceed the base-symbol capacity (`freeBalance` check).
3. Only **completed** credit orders consume the hops/execution level.
4. Every credit trade settles against CREDIT wallets; deposit trades against DEPOSIT wallets.
5. Drawdown liquidation never destroys money — the loss is taken from collateral and any remainder is returned to the user.
6. Settlement is idempotent (status guard on ACTIVE/SUSPENDED/EXPIRED).

---

## 11. Related files

**Backend**
- `src/credit/credit.service.ts`
- `src/credit/settlement/credit-settlement.service.ts`
- `src/credit/cashout/credit-cashout.service.ts`
- `src/credit/credit-cron.service.ts`
- `src/credit/user/credit-user.controller.ts`
- `src/credit/admin/credit-admin.controller.ts`
- `src/order/order.service.ts`
- `src/order/admin/admin-order.service.ts`
- `src/wallet/services/wallet-order.service.ts`
- `src/rabbitmq/consumers/order-status.consumer.ts`
- `src/quote-request/quote-request.service.ts`
- `src/user-level/user-level.service.ts`
- Migrations: `1000000000057` … `1000000000089`

**Panels**
- `goldex-user-panel/src/pages/{TradePage,EliteTradePage,OfferPage,CreditPage,WalletPage}.jsx`
- `goldex-user-panel/src/components/CreditCashoutDialog.jsx`
- `goldex-admin-panel/src/pages/{CreditsPage,LevelsPage,WalletsPage}.tsx`
- `goldex-admin-panel/src/pages/credit/detail/CashoutPanel.tsx`