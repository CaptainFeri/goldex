# Credit Settlement Engine — Design & Implementation Plan

**Status:** Implementation baseline
**Scope:** Value-correct settlement/liquidation for the credit (leveraged collateral) facility.

---

## 1. Problem statement

The current settlement logic is nominal-based:

- `settleFromUser` repays `credit.amount` (the full credit line) regardless of how
  much the user actually borrowed, so unused credit can be released as if it were
  the user's money.
- SELL (short) obligations are not tracked — the XAU the user sold via credit is
  never required back, so a short position can never be repaid.
- Positions are not valued at market: settlement ignores mark-to-market PnL, so
  gains/losses are not realised and collateral is returned regardless of outcome.
- The virtual SELL capacity (`collateralAmount × leverage`) added to the CREDIT
  XAU wallet had to be clawed back manually, and mixed with real purchased XAU.

The result is economically incorrect settlement and unmanageable short exposure.

## 2. Goals

1. Settle the **actual economic position** (borrowed vs held) at **mark price**.
2. Support both **LONG** (credit BUY) and **SHORT** (credit SELL) positions.
3. Release surplus to the DEPOSIT wallet, or consume collateral for a deficit
   (**full recourse** for any remaining shortfall).
4. Make settlement **idempotent** and auditable (a settlement report is stored on
   the facility).
5. Provide a single engine reused by user self-settlement, admin settlement,
   drawdown enforcement, margin-call liquidation and expiry.

## 3. Model — obligations derived from executed credit orders

The single source of truth for what the user owes/owns is the executed
credit-linked orders (`credit_order` + `order.executed_quantity`).

For every credit-linked order with `executedQuantity > 0`:

| Side | Obligation | Asset |
|------|-----------|-------|
| BUY  | `borrowedIr += qty × price` | `purchasedXau += qty × (1 − buyComm/100)` |
| SELL | `borrowedXau += qty` | `sellRevenueIr += qty × price` |

- BUY price = the customer (display) price actually debited (`order.price`).
- SELL price = the pure gram price actually credited (`order.mesghal_price / MESQAL_TO_GRAM`).

### 3.1 Net position

```
netIr     = sellRevenueIr − borrowedIr
netXau    = purchasedXau − borrowedXau
netEquity = netIr + netXau × markPrice
```

`markPrice` = current `bestSellGramPrice` of the collateral/base symbol vs the
credit base symbol (IRR). Collateral denominated directly in IRR ⇒ `markPrice = 1`.

### 3.2 Equity & margin

```
collateralValue = collateralAmount × markPrice
exposure        = borrowedIr + borrowedXau × markPrice
equity          = collateralValue + netEquity
marginRatio     = exposure > 0 ? equity / exposure : ∞
```

- `marginRatio ≤ maintenance`  → `MARGIN_CALL`
- `marginRatio ≤ liquidation`  → force liquidation

## 4. Settlement math

### Solvent (`netEquity ≥ 0`)

- `netIr ≥ 0` and `netXau ≥ 0` → release `netIr` IRR + `netXau` XAU to DEPOSIT.
- `netIr ≥ 0`, `netXau < 0` (short) → buy back the short at mark price; release
  `netEquity` IRR.
- `netIr < 0`, `netXau ≥ 0` (long, net borrower) → sell `−netIr / markPrice` XAU
  to repay the loan; release remaining `netXau − coverXau` XAU.
- Collateral fully returned.

### Insolvent (`netEquity < 0`)

- `deficit = −netEquity`.
- `consumedCollateral = deficit / markPrice` (in collateral units).
- If `consumedCollateral ≥ collateralAmount` → all collateral seized,
  `shortfall = deficit − collateralValue` (full recourse, `isInDefault = true`).
- Otherwise consume `consumedCollateral`, return the rest to DEPOSIT.

## 5. Settlement procedure (idempotent, transactional)

```
1. Load facility with pessimistic lock; guard status == ACTIVE.
2. Resolve mark price; abort if unavailable (defer, don't guess).
3. Cancel open credit orders: release their frozen balances (unlockOrder),
   mark credit_order CANCELLED.
4. Compute borrowed/held/net positions from executed credit orders.
5. Determine settlement result (surplus / deficit / collateral consumed).
6. Apply:
   - Zero all CREDIT wallets (line + free + locked).
   - USER_SELF mode: allow top-up of a deficit from the DEPOSIT IRR wallet first.
   - Move surplus IRR / XAU to the DEPOSIT wallets.
   - Consume collateral for the deficit; return remaining collateral to DEPOSIT.
7. Mark facility SETTLED (settlementState = SETTLED, settledAt).
8. Persist settlement report in metadata + finance logs + notification + event.
```

Idempotency: the pessimistic lock + `status == ACTIVE` guard makes repeated calls
no-ops. `outstandingShortfall` / `isInDefault` reflect full-recourse residue.

## 6. Liquidation (force close)

Any enforcement path (drawdown ENFORCE, margin call, expiry, admin force) calls the
same engine with a reason. Liquidation does NOT create a real provider order; it
**cash-settles at the current mark price** — consistent with the handoff's
liquidation process (read fresh mark price → recompute PnL → verify → realise PnL →
deduct loss from collateral → settle obligations).

## 7. Integration

| Entry point | Mode |
|---|---|
| `POST /credits/:id/settle` (`settleFromUser`) | `USER_SELF` (deposit top-up allowed) |
| `POST /admin/credits/:id/settle` (`settleCredit`) | `ADMIN` |
| `enforceDrawdownRules` → `liquidateForDrawdown` | `DRAWDOWN` |
| `liquidateCreditForMarginCall` | `MARGIN_CALL` |
| `processExpiredCredits` | `EXPIRY` |
| `evaluateRiskState` (risk cron) | reads engine equity/margin |

## 8. Files

- `src/credit/settlement/credit-settlement.service.ts` — new engine (computeState,
  settleCredit, liquidate).
- `src/wallet/services/wallet-order.service.ts` — add manager-scoped `unlockOrder`.
- `src/credit/credit.service.ts` — delegate the five entry points above.
- `src/credit/credit.module.ts` — register the engine.

## 9. Non-goals (future)

- Real (provider) close orders during liquidation instead of cash settlement.
- Partial liquidation (close only enough to restore margin).
- Cross-facility / portfolio margin.