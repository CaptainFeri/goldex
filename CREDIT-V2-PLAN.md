# Credit System v2 — Implementation Plan

## Confirmed decisions
| Decision | Choice |
|---|---|
| Wallet separation | `walletType` column: `DEPOSIT / CREDIT / COLLATERAL` rows per symbol |
| Level base symbol | credit currency (IRR) = pair **quote** side; level pairs = pairs quoted in IRR |
| Credit creation | Fully automatic user self-service (freeze + leverage → instant ACTIVE) |
| Drawdown | unrealized loss % vs frozen collateral value |
| Pair time limits | per side: **x** = warn hours, **y** = expire hours, **z** = post-expire grace hours |
| Enforce close | applies to credit-linked requests only |
| Scope | Incremental on existing modules |

---

## A. Backend — `goldex-backend`

### A1. Wallet separation (foundation)
- **`src/wallet/enum/wallet-type.enum.ts`** (new): `DEPOSIT | CREDIT | COLLATERAL`.
- **`wallet.entity.ts`**: add `walletType` (default `DEPOSIT`), index `(userId, symbolId, walletType)` unique.
- Migration `1000000000081-walletTypeMig.ts`: add column; backfill — move existing `creditBalance` into new `CREDIT` rows, credit-frozen collateral (`frozenFreeBalance` from active credits) into `COLLATERAL` rows; zero out `creditBalance` on DEPOSIT rows.
- **`user-wallet.service.ts`**: registration still creates DEPOSIT wallets only; CREDIT/COLLATERAL rows created lazily per facility. View exposes `walletType`.
- **`wallet-order.service.ts`**: credit orders settle against CREDIT wallets; withdrawals/deposits touch DEPOSIT only; COLLATERAL wallets are not tradeable directly.

### A2. User-level credit config
**`user-level.entity.ts`** — new columns (not jsonb, for typed admin UX):
| Field | Meaning |
|---|---|
| `creditBaseSymbolId` FK→Symbol | credit currency (IRR) |
| `creditMaxLeverage` decimal | e.g. 10 |
| `creditDrawdownPercent` decimal | loss % vs frozen collateral |
| `creditEnforceOnDrawdown` enum `ENFORCE/ALERT` | reaction to drawdown touch |
| `creditEnforceOnExpiry` enum `ENFORCE/ALERT` | reaction to settlement expiry |
| `creditEnforceRequestDeadline` boolean | close vs alert-only for expired pend requests |
| `creditMaxParallelRequests` int | concurrent pending credit requests |
| `creditMaxExecutionLevel` int | max hops (IRR→XAU =1, XAU→AED =2) |
- `create/update` DTOs + validation: every level pair must have `quoteId == creditBaseSymbolId`.
- Keep existing `CREDIT_TRADING_ENABLED`, `CREDIT_MAX_AMOUNT`, `CREDIT_MAX_DURATION_DAYS` feature keys.

### A3. Price-pair time limits
**`price.pair.entity.ts`** — 6 new columns: `buyWarnHours(x)`, `buyExpireHours(y)`, `buyGraceHours(z)`, `sellWarnHours`, `sellExpireHours`, `sellGraceHours` (all nullable int).
- Update `create-pair.dto.ts`, `update-price-paird.dto.ts`, admin-pair service/controller, and `market.controller.ts` view.
- **`order.entity.ts` + `quote-request.entity.ts`**: add `pendDeadlineWarnAt`, `pendDeadlineExpireAt`, `pendDeadlineGraceEndAt` (computed at creation from pair side-fields, only when credit-linked) + `pendDeadlineState` (`GREEN/YELLOW/RED/GRACE/CLOSED`).
- **New cron** in `credit-cron.service.ts` (every 5 min): scan credit-linked pending requests:
  - past `warnAt` → notification (YELLOW)
  - past `expireAt` → RED notification
  - past `graceEndAt` → if user level `creditEnforceRequestDeadline` → cancel request + unlock funds + notify; else admin alert only.

### A4. Credit facility (self-service) — rework `credit.service.ts`
- New user endpoint **`POST /credits/request`** `{ depositWalletId, amount, leverage }`:
  1. Guards: level `CREDIT_TRADING_ENABLED`, leverage ≤ `creditMaxLeverage`, amount ≤ `CREDIT_MAX_AMOUNT`, no ACTIVE facility, KYC rules.
  2. Freeze: move `amount` from DEPOSIT wallet → COLLATERAL wallet row (txn `COLLATERAL_FREEZE`).
  3. `collateralValue = amount × current pair price` (collateral symbol vs level base symbol).
  4. `creditLimit = collateralValue × leverage` in base symbol (IRR).
  5. Create CREDIT wallet row for base symbol, credit `creditLimit`; facility = `CreditEntity` ACTIVE, snapshot of level settings (`drawdownPercent`, enforce flags, `maxParallelRequests`, `maxExecutionLevel`), `expireAt` per `CREDIT_MAX_DURATION_DAYS`.
- `CreditEntity` additions: `leverage`, `creditLimit`, `usedCredit`, `collateralSymbolId`, `collateralAmount`, `initialCollateralValue`, `currentCollateralValue`, `lastDrawdownPercent`.
- Keep admin settle/cancel endpoints; keep admin create as override.

### A5. Order path (`order.service.ts`)
For credit-linked orders:
1. Settle via CREDIT wallets; BUY consumes base-symbol credit, SELL consumes credit-acquired asset.
2. **Parallel limit**: count ACTIVE pending credit orders ≤ snapshot `maxParallelRequests`.
3. **Execution level/hops**: `tradeChainLevel` = parent level + 1; reject if > `maxExecutionLevel`. Asset acquired at max level is **locked** until settlement.
4. **Drawdown check at every order**: re-price open credit positions; `drawdown = loss / currentCollateralValue`; if ≥ snapshot `drawdownPercent` → ENFORCE: liquidate (A6); ALERT: notify + block exposure-increasing orders.
5. Pair pend-deadline fields stamped onto the order (A3).

### A6. Settlement — two approaches
**1) Drawdown touched (ENFORCE)** — `liquidateForDrawdown()`:
- Cancel open credit orders; compute lose amount at fresh prices; convert collateral at current price, deduct loss from COLLATERAL wallet; claw back used credit from CREDIT wallets; remaining collateral → DEPOSIT wallet; facility `SETTLED` (`metadata.settleReason = DRAWDOWN_LIQUIDATION`); notify.

**2) Settlement expiry**:
- `processExpiredCredits`: if `creditEnforceOnExpiry = ALERT` → notify user+admin, facility stays for manual handling.
- ENFORCE → user settles credit currency via **`POST /credits/:id/settle`** (new user endpoint): system debits owed credit (IRR) from CREDIT wallet; if short, user must deposit the difference into DEPOSIT first (or covered from collateral conversion); upon full repayment, all credit-acquired assets move CREDIT → DEPOSIT wallets (released). Facility → `SETTLED`.
- If user does not settle within grace → auto path 1 (liquidate collateral, cover owed, release surplus).
- ALERT mode → cron only notifies; admin settles manually via existing endpoints.

### A7. Admin overview endpoints
- **`GET /admin/pair/:id/requests-overview`**: pending credit requests per pair, per side, each with computed period status (`GREEN/YELLOW/RED/GRACE` based on x/y/z and created time), counts, and aggregate stats (total pending qty/value per side).
- Extend `GET /admin/credits` response with facility metrics (leverage, used/available credit, drawdown%, risk/settlement state).

---

## B. Frontend

### B1. Admin panel (`goldex-admin-panel`, TS + react-query)
- **`LevelsPage.tsx`**: new "Credit" section — base symbol selector, pair multi-select (auto-filtered to pairs whose quote = base), max leverage, drawdown %, three enforce controls (drawdown / expiry / request deadline), max parallel requests, max execution level. Update `FEATURE_LABELS`/types.
- **`PairsPage.tsx`**: PairForm gains 6 time-limit inputs (buy x/y/z, sell x/y/z); new per-pair **"Requests Overview"** modal — table of pending credit requests with period-status badges + countdowns (warn/expire/grace) and side aggregates.
- **`CreditsPage.tsx`**: facility dashboard columns (leverage, collateral symbol/amount/value, creditLimit, used/available, live drawdown gauge, risk & settlement states), actions: settle, cancel, force-liquidate.
- **`api/types.ts`**: extend `Credit`, `PricePair`, `UserLevel` types.

### B2. User panel (`goldex-user-panel`, JSX + i18next)
- **`CreditPage.jsx`** → self-service flow:
  - Request form: pick deposit wallet → amount → leverage slider (max from level) → projected credit limit; submit → instant facility.
  - Active facility dashboard: used/available credit, collateral value, drawdown progress bar vs level threshold, settlement deadline countdown, hops used, parallel requests used, notifications (existing).
  - **Settle button**: repay credit currency → shows required IRR amount; on success lists released assets moving to deposit wallets.
- **`WalletPage.jsx`**: group wallets by type (Deposit / Credit / Collateral sections); deposit & withdraw buttons only on Deposit wallets; credit/collateral wallets show lock badges.
- **`TradePage.jsx` / `OfferPage.jsx`**: pending credit requests show deadline countdown badge (GREEN/YELLOW/RED/GRACE).
- **`services/api.js`**: `creditApi` — `POST /credits/request`, `POST /credits/:id/settle`, plus existing reads.
- **`locales/en.json` / `fa.json`**: new keys.

---

## C. Migration & verification
1. Migration covering: wallet_type column + backfill split, user_level credit columns, price_pairs 6 columns, order/quote-request deadline columns, credit facility columns.
2. Backward compat: existing ACTIVE credits converted to facility shape in migration; old admin-create path keeps working.
3. Verification: `npm run build` + eslint in `goldex-backend`; targeted jest tests for drawdown calc, hop enforcement, deadline cron; frontend builds in both panels.

## Execution order
1. A1 wallets → 2. A2 levels → 3. A3 pairs → 4. A4 facility → 5. A5 orders → 6. A6 settlement → 7. A7/A8 admin APIs + cron → 8. B1 admin panel → 9. B2 user panel.
