# RIAL P2P — Admin Panel & User Panel

Companion to `RIAL-P2P-SETTLEMENT-PLAN.md`, which specifies the backend.
This document covers the two frontends and records what has been built.

> **Status: the backend has since shipped** in `src/p2p/` and
> `src/admin-bank-account/`, so these screens run against a real API. The
> surface is still isolated to one module per panel (`src/api/p2p.ts`,
> `src/services/api.js` → `p2pApi`), so a contract change stays a single-file
> edit. No migration has been run yet — see §5.

---

## 1. Admin panel (`goldex-admin-panel` — React + TS, react-query, RTL Persian)

### 1.1 Company bank accounts — `/bank-accounts`

The screen the whole admin-settlement path depends on. An admin creates a
company account and decides what it is *for*.

**Direction is two toggles, not one dropdown.** `useForDeposit` and
`useForWithdraw` are independent, so an account is deposit-only, withdraw-only,
both, or parked. Both are switchable straight from the table row — retiring an
account from one direction is one click, and does not disturb the other.

Each direction carries **its own limits and its own usage bar**
(`deposit_daily_limit` / `withdraw_daily_limit`), because they are different
risk controls: money coming in is a reconciliation problem, money going out is
a loss problem. The bar turns amber past 80% and red at 100%, which is the
number that decides whether the matching engine can still pick the account
today.

Other behaviour worth noting:

- **Retiring is a status change, never a delete** — settled matches reference
  these rows. The table offers ACTIVE ⇄ INACTIVE with a confirmation noting
  that in-flight matches are unaffected.
- **Account and card numbers are masked** in the table (`1234••••5678`); the
  full value only appears in the edit modal.
- The symbol dropdown is filtered to rial symbols, so an account cannot be
  attached to a crypto symbol by accident.

### 1.2 P2P settlement — `/p2p`

Dashboard cards (pending withdrawals, unmatched deposits, waiting
confirmation, escalated, timeout risk, admin liquidity, today's settlements)
over the escalation queue, both polling every 30s because these cases age in
minutes.

The queue filters by status and reason and shows the two columns an operator
actually triages on: **age** and **deadline**, the latter rendered as a badge
that goes amber under two hours and red once passed.

The resolve modal carries everything needed to decide without leaving the page:
the payment proof (with an OCR-mismatch badge), the **frozen destination
snapshot** — what the depositor was actually told to pay, not a live join that
could have been edited since — the match score breakdown so the engine's choice
is reviewable, and the event timeline. The six decision types from the spec are
offered; `SETTLE_FROM_ADMIN` reveals an account picker limited to accounts open
for **withdraw**, and says so plainly when none are. A reason note is mandatory
because it goes into the audit log.

### 1.3 P2P settings — `/p2p/settings`

Every runtime policy from Appendix A: the two independent timeouts, reservation
TTL, request expiry, source priority per direction, the six matching weights
(with a running total that flags when it is not 100), escalation notification
rules, over/under split, and the two-person approval threshold.

### 1.4 Files touched

| File | Change |
|---|---|
| `src/api/p2p.ts` | new — `bankAccountsApi` + `p2pApi` |
| `src/api/types.ts` | new types for accounts, matches, proofs, escalations, settings |
| `src/lib/enums.ts` | `p2p` added to the rial rows; Persian label maps |
| `src/pages/BankAccountsPage.tsx` | new |
| `src/pages/P2pEscalationsPage.tsx` | new |
| `src/pages/P2pSettingsPage.tsx` | new |
| `src/App.tsx`, `src/components/Layout.tsx` | routes, nav entries, page titles |

`npm run typecheck` and `npm run build` both pass.

---

## 2. User panel (`goldex-user-panel` — React + JS, i18next, fa/en)

### 2.1 New page — `/p2p`

Two tabs, because a user can be on either side of the trade.

**Depositor tab.** Each intent shows its match, or an honest "still searching"
state when there is none — a queued intent is not an error, and a 404 on the
match endpoint is swallowed rather than shown as a failure. Once matched, the
destination account is rendered from `destinationSnapshotJson` with
copy-to-clipboard buttons on the IBAN, card, and account number (with a silent
fallback when the clipboard API is unavailable on an insecure origin), a live
`mm:ss` countdown on the reservation, and a receipt form: amount, source
account, tracking code, image. The proof POST carries a stable
`Idempotency-Key` so a double-submit cannot create a second proof.

**Withdrawer tab.** Each request shows a settled-vs-remaining progress bar and
its parts. A part whose match is `WAITING_CONFIRMATION` gets confirm and reject
buttons plus a countdown on the response deadline — and the confirm dialog
states the consequence explicitly ("the same amount is deducted from your
locked balance"), because this is the click that moves money.

### 2.2 Wallet modals

`p2p` joins the existing deposit and withdraw type dropdowns for rial symbols.

- **Deposit**: creates an intent, then routes to `/p2p`, since the destination
  is not known until matching has run. An inline note explains that.
- **Withdraw**: collects the split policy — `EXACT` (n parts), `MAXIMUM`
  (up to n), or `RANGE` (min–max) — with the relevant field shown per policy,
  plus optional min/max amount per part. An inline note warns that the balance
  is locked immediately.

### 2.3 Files touched

| File | Change |
|---|---|
| `src/pages/P2pPage.jsx` | new |
| `src/services/api.js` | new `p2pApi` |
| `src/pages/WalletPage.jsx` | p2p branch in both modals |
| `src/App.jsx`, `Sidebar.jsx`, `BottomNav.jsx` | route + nav |
| `src/locales/fa.json`, `en.json` | full `p2p` namespace + wallet keys |
| `src/index.css` | `alert-warning` variant (light theme included) |

`npm run build` passes.

---

## 3. Backend contract these screens assume

Everything below is specified in `RIAL-P2P-SETTLEMENT-PLAN.md` but is listed
here as the checklist for making the panels live. Response shape is the
project standard `{ status, message, data }`, unwrapped by each panel's client.

**Company bank accounts**
```
GET    /api/v1/admin/bank-accounts?direction=deposit|withdraw&symbolId&status
GET    /api/v1/admin/bank-accounts/:id
POST   /api/v1/admin/bank-accounts
PATCH  /api/v1/admin/bank-accounts/:id
PATCH  /api/v1/admin/bank-accounts/:id/directions   { useForDeposit, useForWithdraw }
PATCH  /api/v1/admin/bank-accounts/:id/status       { status }
```

**Admin p2p**
```
GET    /api/v1/admin/p2p/dashboard
GET    /api/v1/admin/p2p/escalations?status&reason&assignedAdminId&minAmount
GET    /api/v1/admin/p2p/escalations/:id
POST   /api/v1/admin/p2p/escalations/:id/resolve    { resolution, adminAccountId?, note }
GET    /api/v1/admin/p2p/matches
GET    /api/v1/admin/p2p/settings
PATCH  /api/v1/admin/p2p/settings
```

**User p2p**
```
GET    /api/v1/p2p/withdrawals
GET    /api/v1/p2p/withdrawals/:id/parts
POST   /api/v1/p2p/withdrawal-parts/:id/confirm-payment
POST   /api/v1/p2p/withdrawal-parts/:id/reject-payment   { reason }
GET    /api/v1/p2p/deposit-intents
GET    /api/v1/p2p/deposit-intents/:id/match      → 404 when still queued
POST   /api/v1/p2p/matches/:id/accept
POST   /api/v1/p2p/matches/:id/cancel
POST   /api/v1/p2p/matches/:id/payment-proof      multipart, Idempotency-Key
```

Two response details the UI leans on:

1. **`destinationSnapshotJson` must be on the match**, not resolved by joining
   the live bank account. Both panels render the destination from the snapshot
   so that editing or retiring an account cannot rewrite what a depositor was
   told to pay.
2. **`GET .../match` returns 404 while an intent is queued.** The user panel
   treats that as the "still searching" state; any other status is shown as an
   error.

`receiptUrl` on a payment proof is expected to be a time-limited presigned
MinIO URL, per §8.2 of the backend plan — the panels render it directly.

---

## 4. Not built, and why

- **Two-person approval UI.** The backend now stages a high-value decision in
  `p2p_escalation.pending_resolution_json` and refuses to let the same admin
  execute it, so the contract exists — but there is no checker queue screen. A
  second admin currently approves by re-submitting the same decision on the
  escalation, which works but is not discoverable.
- **Audit log viewer.** `/api/v1/admin/p2p/audit-logs` is implemented and
  filterable by entity, but no panel page consumes it. The existing
  `/finance-logs` page is the natural model to copy.
- **Live updates.** The admin panel polls every 30s; the user panel refreshes on
  demand. Escalations are now pushed to the admin socket gateway by the
  notification listener, so the admin queue could switch from polling to that
  feed — a panel change, no longer a backend one.
- **Reject-rate / risk display.** `W_RISK` is 0, so there is nothing to show a
  user or admin about counterparty trust yet.

## 5. Before this runs

1. **Run the two migrations**, `…090-adminBankAccountMig` before
   `…091-p2pMatchingMig` — `p2p_match` has an FK to `admin_bank_account`.
2. **Set `GOLDEX_P2P_ADMIN_USER_ID`** to a system user, and fund that user's
   rial wallet. Without it, admin-funded settlement is refused and the
   dashboard's liquidity card reads zero.
3. **Create at least one company bank account** and flag it for deposit and/or
   withdraw. Until one is flagged for withdraw, the
   `SETTLE_FROM_ADMIN` decision has nothing to pay from and says so.
