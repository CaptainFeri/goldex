# Credit Trading Handoff (فارسی) — Gap Analysis & Implementation Status

**Date:** 2026-08-26
**Input documents:** `credit_trading_handoff_fa.docx` and `credit_trading_handoff_fa_final.docx` (revision 1)
**Reference as-built docs:** `credit-implementation-handoff.md`, `credit-settlement-engine.md`, `credit_trading_engine_handoff.md`

This document maps the functional handoffs against the current implementation in
**goldex-backend**, **goldex-admin-panel** and **goldex-user-panel**, records what was already in
place, and lists the gaps that were implemented as part of this work.

---

## 1. Summary

The handoff describes a collateral-backed credit/leverage trading system. The bulk of the
specification was already implemented (a facility with leverage, dedicated CREDIT/COLLATERAL
wallets, mark-to-market settlement engine, risk + settlement state machines, drawdown, expiry,
pre-checks, admin/user APIs). Two implementation passes closed the remaining gaps:

### Pass 1 (original handoff)
| # | Handoff requirement | Status before | Action |
|---|---|---|---|
| 1 | Per-trade collateral lock (Collateral Lock state machine) | ❌ Not present | ✅ Implemented |
| 2 | Delivery-based settlement workflow (7-step state machine) | ❌ Auto cash-settlement only | ✅ Implemented |
| 3 | `max_parallel_trades` / `max_asset_depth` enforcement | ❌ Columns unused | ✅ Implemented |
| 4 | `max_credit_notional` / `max_total_locked_collateral` | ❌ Not modeled | ✅ Implemented |

### Pass 2 (final handoff, revision 1)
| # | Handoff requirement | Action |
|---|---|---|
| 5 | **Admin approval policy** `REQUIRE_ADMIN_APPROVAL_FOR_SETTLEMENT` (ON/OFF) with PENDING_ADMIN_REVIEW / APPROVED / REJECTED | ✅ Implemented |
| 6 | **Three settlement valuation states** (Exposure < / = / > Collateral, single IRR basis) + shortfall enforcement before collateral release | ✅ Implemented |
| 7 | **User-selectable settlement methods** (FULL / NET / TOPUP), admin-enabled, with `settlementMethod`, `requiredTopUp`, `releaseAmount`, `realizedPnL`, `finalCollateralState` recorded | ✅ Implemented |
| 8 | **Dynamic FIAT credit capacity** recomputed on every price update (`creditLimit = currentCollateralValue × leverage`, without touching the credit wallet transaction balance) | ✅ Implemented |
| 9 | **Collateral from the quote OR base currency of a pair** | ✅ Implemented |
| 10 | 50g / 5x test scenario acceptance (AC-11..AC-18) | ✅ Covered by the above |

---

## 2. Already in place (no change needed)

- **Credit facility** (`credit` table): leverage, `creditLimit`, `usedCredit`, collateral
  (`collateralSymbolId`, `collateralAmount`, `initial/currentCollateralValue`), expiry, states.
- **Wallet model** (handoff §3): `DEPOSIT` / `CREDIT` / `COLLATERAL` wallet types with
  `freeBalance`, `lockedBalance`, `creditBalance`, frozen fields.
- **Formulas** (handoff §4): trading power = collateral × leverage; required collateral =
  exposure / leverage; net equity / margin ratio in the settlement engine.
- **Credit capacity** issued at creation for BUY (IRR) and SELL (base symbol).
- **Pre-check guards** in the order path: trading enabled, execution level cap, parallel cap
  (metadata-based), hops cap, drawdown, reduce-only, available-credit check.
- **Settlement engine** (`credit-settlement.service.ts`): mark-to-market, LONG/SHORT netting,
  surplus release, collateral consumption, full-recourse shortfall, idempotent, settlement report.
- **Risk engine**: mark-to-market equity/margin, risk state machine
  (NORMAL → WARNING → MARGIN_CALL → …), drawdown (equity-based), margin-call handling.
- **Settlement timer** state machine (GREEN → YELLOW → RED → ADMIN_REVIEW → …).
- **Expiry**: reminders, `enforceOnExpiry`, pending-deadline (x/y/z) lifecycle.
- **Events & audit**: `CreditEvents`, `finance_log` action types.
- **Panels**: admin credit management (list/KPIs/detail/risk/PnL/actions/CSV), user credit
  page (request/overview/history/notifications/settle).

---

## 3. Gaps implemented in this pass

### 3.1 Per-trade Collateral Lock (handoff §3, §4.2, §13, §14)

**Before:** all collateral was moved to the COLLATERAL wallet at facility creation; no per-trade
lock accounting.

**Now:**
- New `collateral_lock` table + `CollateralLockStatusEnum`
  (`CREATED → ACTIVE → RELEASE_PENDING → RELEASED | CONSUMED`).
- `CreditService.createCollateralLockForOrder` computes `requiredCollateral = notional / leverage`
  and locks it when a credit order is opened (`order.service.ts`).
- `CreditService.releaseCollateralLockForCreditOrder` releases the lock when an order is
  cancelled/rejected before execution (order service, quote-request mirrors, provider consumer).
- Settlement engine (`settleCollateralLocks`) releases the locks (or consumes them to cover a
  deficit) when the facility settles.
- `getCollateralLockSummary` exposes `totalLocked` / `available` (Collateral Locked / Available)
  and is surfaced in the user overview and admin endpoints.

### 3.2 Delivery-based settlement workflow (handoff §7, §13)

**Before:** only automatic cash-settlement (settlement engine).

**Now:**
- New `credit_settlement` table + `SettlementWorkflowStatusEnum`
  (`SETTLEMENT_REQUESTED → ASSET_RECEIVED → ASSET_VERIFIED → LIABILITY_CLEARED →
  ASSET_SETTLED → COLLATERAL_RELEASED → CLOSED | FAILED`).
- `CreditSettlementWorkflowService` (`src/credit/settlement-workflow/`) enforces the ordered,
  idempotent lifecycle; partial delivery is allowed (stays ASSET_RECEIVED until sufficient).
- `LIABILITY_CLEARED` delegates the value transfer to the settlement engine inside the same
  transaction (`settleCreditInTransaction` — new transaction-scoped entry point), so there is a
  single valuation source.
- Endpoints:
  - Admin: `POST /admin/credits/:id/settlement-workflow`,
    `POST /admin/credits/settlements/:id/{receive,verify,clear-liability,settle-asset,release-collateral,close,fail}`,
    `GET /admin/credits/:id/settlements`.
  - User: `POST /credits/:id/settlement`, `GET /credits/:id/settlements`.

### 3.3 Pre-check limits (handoff §9, §15)

`CreditService.runCreditPreCheck` now enforces, before exposure is created (order + quote paths):
- `maxConcurrentOrders` → **max_parallel_trades**
- `maxTradeChainDepth` → **max_asset_depth**
- `maxCreditNotional` → **max_credit_notional**
- `maxTotalLockedCollateral` → **max_total_locked_collateral** (via the lock creation path)

New columns on `credit`: `max_credit_notional`, `max_total_locked_collateral`.
New level fields on `user_level`: `credit_max_notional`, `credit_max_locked_collateral`
(propagated to the facility at `requestCredit`; admin can also set them on `createCredit`).

### 3.4 Panels

- **User panel** (`CreditPage.jsx`): shows Collateral Locked / Available, Max Asset Depth,
  Max Parallel Trades, Max Credit Notional, Max Locked Collateral.
- **Admin panel** (`CreditsPage.tsx`): new table columns (وثیقه قفل/آزاد, محدودیتها) and two
  new sections in the detail modal: Collateral Locks and Settlement Workflow.

---

## 4. Files changed

**Backend (Pass 1 + Pass 2)**
- `src/credit/enum/collateral-lock-status.enum.ts` (new)
- `src/credit/enum/settlement-workflow-status.enum.ts` (new; v4 adds PENDING_ADMIN_REVIEW/APPROVED/VALUATED/METHOD_SELECTED/FUNDING_REQUIRED/READY/REJECTED + method & valuation enums)
- `src/credit/entity/collateral-lock.entity.ts` (new)
- `src/credit/entity/credit-settlement.entity.ts` (new; v4 adds approval/valuation/method/funding fields)
- `src/credit/settlement-workflow/credit-settlement-workflow.service.ts` (new; v4 adds approve/reject/valuate/selectMethod/fund + delivery-first rules)
- `src/credit/dto/settlement-workflow.dto.ts` (new; v4 adds SelectSettlementMethodDto/FundSettlementDto/ApproveSettlementDto/RejectSettlementDto/SettlementPolicyDto)
- `src/migrations/1000000000086-creditV3Mig.ts` (new)
- `src/migrations/1000000000087-creditV4Mig.ts` (new)
- `src/credit/credit.module.ts` — register entities + workflow service
- `src/credit/credit.service.ts` — lock creation/release/summary, pre-check, overview fields, dynamic fiat capacity, base+quote collateral, `updateSettlementPolicy`
- `src/credit/entity/credit.entity.ts` — `maxCreditNotional`, `maxTotalLockedCollateral`, settlement-policy columns
- `src/credit/enum/credit-order-status.enum.ts` — `CLOSED`
- `src/credit/settlement/credit-settlement.service.ts` — transaction-scoped settle, `settleCollateralLocks`, close open credit orders
- `src/credit/admin/credit-admin.controller.ts` — settlement-workflow, locks, policy, approve/reject/valuate/method/fund endpoints
- `src/credit/user/credit-user.controller.ts` — user settlement endpoints
- `src/credit/dto/create-credit.dto.ts` — new admin limit fields
- `src/order/order.service.ts` — pre-check call, lock creation, lock release on cancel/reject
- `src/quote-request/quote-request.service.ts` — pre-check call
- `src/rabbitmq/consumers/order-status.consumer.ts` — lock release on provider reject
- `src/provider-pair-mapping/provider-pair-mapping.module.ts` — register `CollateralLockEntity`
- `src/user-level/entity/user-level.entity.ts` — level notional / locked-ratio fields

**Panels**
- `goldex-user-panel/src/pages/CreditPage.jsx` — base+quote collateral eligibility, new overview fields
- `goldex-admin-panel/src/pages/CreditsPage.tsx` — limits/collateral columns, Collateral Locks + Settlement Workflow sections, settlement-policy controls

---

## 5. Not implemented / intentionally left as product decisions (handoff §22)

> **Architectural caveat:** the handoff's ideal model freezes collateral only *as needed*
> per trade. The existing wallet design still moves the whole collateral amount into the
> COLLATERAL wallet at facility creation; this pass adds the per-trade lock *accounting*
> (`collateral_lock`) on top, so Collateral Locked / Available are now tracked per trade and
> Collateral Available can no longer go negative. Fully switching to lazy per-trade collateral
> freezing (releasing unused collateral back to DEPOSIT at creation) is a further refactor that
> should be scoped separately.

The handoff explicitly marks these as **policy decisions that must not be hard-coded** — they
remain configurable and open:

- Exact **Loss % formula** (loss ratio definition and price basis).
- **Fee type** (asset / quote / fixed / percentage).
- **How loss is deducted from collateral** (real seizure vs. transfer vs. value reduction) —
  the settlement engine currently consumes collateral in-kind for the deficit.
- **Settlement priority** (which trades close first) and **netting** of offsetting trades.
- **Reference price** source (last / bid-ask / VWAP) — currently `bestSellGramPrice`.
- **Expiry grace period** and **price-unavailable behaviour** (freeze/notify/close).
- Allowed collateral assets (currently restricted to level pair base symbols).

---

## 6. Verification

- Backend: `tsc --noEmit -p tsconfig.build.json` — passes.
- Admin panel: `npm run typecheck` — passes.
- User panel: `npm run build` — passes.

> Note: the `credit` / `user_level` DDL changes require running migration
> `1000000000086-creditV3Mig`.