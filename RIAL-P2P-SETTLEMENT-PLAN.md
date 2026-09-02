# RIAL P2P Matching & Settlement — Backend Implementation Plan

Source spec: `payment_matching_technical_spec_fa.docx` (v1.0 — سند فنی سیستم Matching و تسویه واریز / برداشت)
Target: `goldex-backend` (NestJS 11 + TypeORM + Postgres + Redis + RabbitMQ + MinIO)
Branch: `claude/goldex-rial-withdraw-deposit-gfe8wj`

---

## 1. What this adds

A third settlement option for `symbolType = rial`, alongside the existing ones:

| Symbol type | Deposit types today | Withdraw types today |
|---|---|---|
| `rial` | `manual`, `payment-gateway` | `manual`, `auto` |
| `crypto` | `manual`, `hdwallet` | `manual`, `auto` |
| `fiat` | `manual`, `payment-gateway` | `manual`, `auto` |
| `material` | `warehouse`, `borrow` | `warehouse`, `borrow` |

**New: `p2p`** — added to `rial` only. A withdrawer's request is filled by one or more
depositors who transfer real rial to the withdrawer's bank account; the platform then moves
the *internal* rial balance from withdrawer to depositor. No external rail is touched, so no
gateway fee and no bank settlement window — the platform is a matching venue plus escrow.

Money direction (this is the invariant everything else hangs off):

```
withdrawer (has platform IRR, wants bank IRR)   depositor (has bank IRR, wants platform IRR)
        |                                                    |
        |<---------- real bank transfer (off-platform) ------|
        |                                                    |
        |------- internal locked IRR balance --------------->|
                     (moved only on CONFIRMED)
```

Platform-wide IRR is conserved on every confirmed part. That is the reconciliation check.

---

## 2. Design decisions fixed up front

These mirror §17 of the spec and are adapted to what already exists in this repo.

1. **Reuse `withdraw` / `deposit` rows as the outer envelope.** A p2p withdrawal is a
   `WithdrawEntity` with `type = "p2p"`; a deposit intent is a `DepositEntity` with
   `type = "p2p"`. This keeps KYC gating, level limits, cooldowns, user history, admin
   lists, and the existing notification listeners working with zero changes.
2. **Detailed state lives in 1:1 child tables**, not in `withdraw.status`. The coarse
   `WithdrawStatusEnum` / `DepositStatusEnum` stay as the public/admin-list status; the
   spec's state machines live in `p2p_withdraw_request.state` and
   `p2p_deposit_intent.state`. No new values are forced into the shared enums, and other
   symbol types are unaffected.
3. **The wallet ledger is the source of truth.** Balance only changes via a
   `TransactionEntity` row inside a DB transaction. Every p2p transaction carries
   `metadata.matchId` / `metadata.partId` so it is reconcilable.
4. **Withdrawer balance is locked at request time.** The current `manual`/`auto` withdraw
   flow deducts only on `COMPLETED` — that is unsafe here, because depositors pay real money
   against a promise. p2p moves `freeBalance → lockedBalance` when the request is submitted.
5. **Matching and reservation are separate concerns but one atomic DB operation**
   (`SELECT … FOR UPDATE SKIP LOCKED` on `p2p_withdraw_part`).
6. **Withdrawer reject or non-response always produces an escalation.** Never auto-settle.
7. **Policies and timeouts are configurable at runtime** via a new settings table, not env.
8. **Company bank accounts are a first-class, admin-managed resource** in their own shared
   table — not a p2p implementation detail and not config. An admin creates an account and
   flags it for deposit, withdraw, or both; the flags are what make it selectable in each
   direction.

---

## 3. Data model

New tables, all prefixed `p2p_`, all extending `myBaseEntity` (uuid PK, `created_at`,
`updated_at`, `deleted_at`) except where noted.

### 3.1 `p2p_withdraw_request` — 1:1 with `withdraw`

| Column | Type | Notes |
|---|---|---|
| `withdraw_id` | uuid FK → `withdraw.id`, unique | envelope |
| `user_id` | uuid FK → `user.id` | denormalised for queries |
| `symbol_id` | uuid FK → `symbol.id` | |
| `total_amount` | numeric(20,8) | = `withdraw.amount` |
| `completed_amount` | numeric(20,8) default 0 | sum of CONFIRMED parts |
| `remaining_amount` | numeric(20,8) | generated/maintained, indexed |
| `split_policy` | enum `EXACT` \| `MAXIMUM` \| `RANGE` | |
| `required_parts` | int null | EXACT |
| `min_parts` / `max_parts` | int null | RANGE / MAXIMUM |
| `min_part_amount` / `max_part_amount` | numeric null | structured constraint |
| `preferred_bank` | varchar null | structured constraint |
| `allowed_from` / `allowed_until` | timestamptz null | time-window constraint |
| `free_conditions` | text null | display/admin only — never fed to matching |
| `destination_bank_account_id` | uuid FK → `user_bank_account.id` | where depositors pay |
| `state` | enum (see §4.1) | indexed |
| `expires_at` | timestamptz | |
| `locked_amount` | numeric | currently held in `lockedBalance` |
| `version` | int | optimistic lock |

### 3.2 `p2p_withdraw_part`

`withdraw_request_id` FK, `sequence_no`, `target_amount`, `confirmed_amount`,
`status` (`OPEN` \| `RESERVED` \| `PAID_PENDING` \| `CONFIRMED` \| `CANCELLED` \| `EXPIRED`),
`active_reservation_id` (uuid null, unique partial index where not null),
`reserved_until` timestamptz null, `version` int.

> Index: `(status, target_amount) WHERE status = 'OPEN'` — the matching hot path.

### 3.3 `p2p_deposit_intent` — 1:1 with `deposit`

`deposit_id` FK unique, `user_id`, `symbol_id`, `requested_amount`,
`constraints_json` jsonb, `state` (see §4.2), `retry_count`, `expires_at`.

### 3.4 `p2p_match`

`deposit_intent_id` FK, `withdraw_part_id` FK, `amount`, `score` numeric,
`score_breakdown_json` jsonb, `source` (`CUSTOMER` \| `ADMIN`),
`admin_account_id` uuid null → `admin_bank_account.id` (set when filled from a company account),
`reserved_at`, `reservation_expires_at`, `response_deadline_at`,
`settlement_deadline_at`, `status` (see §4.3), `destination_snapshot_json` jsonb
(bank/account/card/owner as shown to the depositor — frozen at reservation so a later
edit of the bank account cannot rewrite history).

### 3.5 `p2p_payment_proof`

`match_id` FK (1:0..1), `amount`, `source_account`, `destination_account`,
`tracking_code`, `paid_at`, `receipt_object_name` (MinIO), `ocr_result_json` jsonb,
`ocr_mismatch` boolean, `submitted_at`, `idempotency_key` unique.

### 3.6 `p2p_escalation`

`match_id` FK, `reason` enum (`WITHDRAWER_REJECT`, `WITHDRAWER_NO_RESPONSE`,
`SETTLEMENT_TIMEOUT`, `RECEIPT_MISMATCH`, `DUPLICATE_PAYMENT`, `ADMIN_ACCOUNT_UNAVAILABLE`),
`priority` smallint, `status` (`OPEN` \| `ASSIGNED` \| `RESOLVED` \| `VOID`),
`deadline_at`, `assigned_admin_id`, `resolution_type` enum (§5.2),
`resolution_note`, `resolved_by_admin_id`, `resolved_at`,
`checker_admin_id` / `checked_at` (two-person control, §8.3).

### 3.7 `admin_bank_account` — company accounts, created by an admin

Deliberately **not** `p2p_`-prefixed. There is no company bank account table in the codebase
today: `user_bank_account` is per-customer, `shahin_accounts` is provider-sourced customer
data, and the existing `manual` deposit flow shows the user no destination at all. One
shared table serves p2p admin settlement now and can give the `manual` flow a real
destination later without a second migration.

| Column | Type | Notes |
|---|---|---|
| `title` | varchar | admin-facing label, e.g. «ملت – حساب اصلی» |
| `bank_name` | varchar | |
| `owner_name` | varchar | as registered on the bank account |
| `account_number` | varchar null | |
| `card_number` | varchar null | |
| `iban` | varchar null, unique | |
| `symbol_id` | uuid FK → `symbol.id` | which currency this account settles |
| `use_for_deposit` | boolean default false | offered as a **destination** to depositors |
| `use_for_withdraw` | boolean default false | used as the **source** for admin payouts |
| `priority` | int default 0 | lower is tried first, evaluated per direction |
| `deposit_daily_limit` / `deposit_per_tx_limit` | numeric null | null or 0 = unlimited |
| `withdraw_daily_limit` / `withdraw_per_tx_limit` | numeric null | |
| `deposit_used_today` / `withdraw_used_today` | numeric default 0 | |
| `used_today_date` | date | rollover marker for the reset job |
| `active_from_hour` / `active_to_hour` | smallint null | active window; null = 24h |
| `status` | enum `ACTIVE` \| `INACTIVE` \| `SUSPENDED` | |
| `notes` | text null | |

**"Deposit / withdraw / both" is two independent booleans, not a three-value enum.**
Both-false is legal (a parked account) and both-true is the ordinary case — one company
account that receives from depositors and pays out to withdrawers. Two flags keep selection
a plain `WHERE use_for_deposit = true`, and let each direction carry its own limits, which
matters because they are different risk controls: money coming in is a reconciliation
problem, money going out is a loss problem. A single `daily_limit` would force one number
to govern both.

Partial indexes: `(priority) WHERE use_for_deposit AND status = 'ACTIVE'` and the
`use_for_withdraw` equivalent.

**Creation.** The admin submits the account and may flag it for either direction
immediately. There is deliberately no owner-name inquiry: these are the company's own
accounts, entered by a `SUPER_ADMIN`, so the ownership check that customer bank accounts
need adds nothing here. If that changes, the hook is `IKycProvider.getIbanInfo(iban)` /
`getCardInfo(cardNumber)` on the existing Jibit provider.

**Lifecycle.** Accounts are never hard-deleted (financial records reference them). Retiring
one is `status = INACTIVE` or clearing both direction flags; either way in-flight matches
are unaffected because `p2p_match.destination_snapshot_json` froze the account details at
reservation time. Every create/update/flag-change writes a `p2p_audit_log` row with
before/after, and the write endpoints are `SUPER_ADMIN`-only.

**Selection.** Per direction, in priority order, filtered to `status = ACTIVE`, the matching
symbol, inside the active-hours window, and with headroom on both the per-tx and remaining
daily limit for that direction. If every candidate is exhausted the engine raises an
`ADMIN_ACCOUNT_UNAVAILABLE` escalation rather than silently falling back to a customer match
(spec §7.1).

Admin *liquidity* — as opposed to the bank account itself — reuses the existing wallet
stack: a designated system user (`GOLDEX_P2P_ADMIN_USER_ID` in config) owns a normal
`WalletEntity` per rial symbol. Admin settlement is a `TransactionEntity` pair between that
wallet and the customer wallet, so `admin_wallets` / `admin_wallet_transactions` from the
spec's ERD are **not** new tables here — they are the existing `wallet` / `transaction`.
The bank account records where the *real* money moved; the wallet records the internal leg.
`p2p_match.admin_account_id` ties the two together for reconciliation.

Both company legs must be written, or conservation breaks: when the company pays a
withdrawer, the withdrawer's locked balance falls **and the company wallet rises**; when a
depositor pays a company account, the depositor's free balance rises **and the company
wallet falls**. `P2pLiquidityService` owns both, refuses a debit beyond the company's own
balance, and reports the spendable total (with a per-symbol breakdown) for the operations
dashboard. With the env var unset, admin-funded settlement is simply refused and the
dashboard reports zero rather than the service failing.

### 3.8 `p2p_setting`

`key` varchar PK, `value_json` jsonb, `updated_by_admin_id`, `updated_at`.
Seeded from Appendix A of the spec (§7 below). Read through a Redis-cached
`P2pSettingService` (30s TTL, busted on write).

### 3.9 `p2p_audit_log`

`actor_type` (`USER` \| `ADMIN` \| `SYSTEM`), `actor_id`, `action`, `entity_type`,
`entity_id`, `before_json`, `after_json`, `ip`, `user_agent`, `created_at`.
Insert-only: no update/delete path is exposed, and the entity has no
`@DeleteDateColumn`. `finance_log` is intentionally not reused — its `actionType` is
`CreditActionEnum` and it has no before/after snapshot.

---

## 4. State machines

### 4.1 `p2p_withdraw_request.state`

```
DRAFT → PENDING_MATCHING → PARTIALLY_MATCHED → COMPLETED
                    │              │
                    │              ├→ ADMIN_SETTLEMENT → COMPLETED
                    │              └→ EXPIRED
                    ├→ CANCELLED
                    └→ EXPIRED
```

Envelope mapping: `PENDING_MATCHING`/`PARTIALLY_MATCHED`/`ADMIN_SETTLEMENT` →
`withdraw.status = PROCESSING`; `COMPLETED` → `COMPLETED`; `CANCELLED` → `CANCELLED`;
`EXPIRED` → `FAILED`.

### 4.2 `p2p_deposit_intent.state`

`CREATED → MATCHING → RESERVED → AWAITING_PAYMENT → PAYMENT_PROOF_SUBMITTED →
WAITING_WITHDRAWER_CONFIRMATION → CONFIRMED`, with branches
`REJECTED_BY_WITHDRAWER` / `WITHDRAWER_RESPONSE_TIMEOUT → ESCALATED_TO_ADMIN →
ADMIN_DECISION → {CONFIRMED | REJECTED | REFUNDED | MORE_INFO_REQUESTED}`,
plus `NO_MATCH` (queued / admin-fallback) and `EXPIRED`.

Envelope mapping: everything up to `WAITING_WITHDRAWER_CONFIRMATION` →
`deposit.status = PENDING`; escalated/`ADMIN_DECISION` → `PROCESSING`;
`CONFIRMED` → `COMPLETED`; `REJECTED`/`EXPIRED` → `FAILED`; user cancel → `CANCELLED`.

### 4.3 `p2p_match.status`

`RESERVED → AWAITING_PAYMENT → PROOF_SUBMITTED → WAITING_CONFIRMATION → CONFIRMED`,
or `→ REJECTED_BY_WITHDRAWER` / `→ RESPONSE_TIMEOUT` / `→ ESCALATED` / `→ RESOLVED_*`,
plus `RESERVATION_EXPIRED` and `CANCELLED`.

Transitions are enforced by a single `assertTransition(from, to)` table in
`p2p/state/transitions.ts`. Any illegal transition throws — no ad-hoc flag flipping.

---

## 5. Services

### 5.1 `P2pMatchingService`

```
reserve(intent):
  BEGIN
    candidates = SELECT p.* FROM p2p_withdraw_part p
                 JOIN p2p_withdraw_request r ON …
                 WHERE p.status = 'OPEN'
                   AND r.state IN ('PENDING_MATCHING','PARTIALLY_MATCHED')
                   AND r.symbol_id = :symbolId
                   AND r.user_id <> :depositorId
                   AND <hard filters §6.2 of spec>
                 ORDER BY <cheap pre-sort>
                 LIMIT 50
                 FOR UPDATE OF p SKIP LOCKED
    score each candidate (weights from p2p_setting)
    pick best; set status=RESERVED, active_reservation_id, reserved_until
    insert p2p_match with score + score_breakdown_json
  COMMIT
```

`SKIP LOCKED` is what makes the concurrency test (two depositors racing one part) pass
without a Redis lock. `score_breakdown_json` is always persisted so an admin can review why
the engine chose a part.

Score (all weights configurable):

```
score = W_AMOUNT*amount_fit + W_PARTS*parts_fit + W_CONSTRAINTS*constraint_fit
      + W_AGE*age_fit + W_PRIORITY*source_priority + W_RISK*risk
amount_fit = 1 - |remaining - deposit_amount| / max(remaining, deposit_amount)
```

If no candidate: apply `source_priority.deposit` — `CUSTOMER_FIRST` queues the intent
(`NO_MATCH`, retried by the worker up to `matching_max_retry`), `ADMIN_FIRST` (or fallback
after retries) reserves against the highest-priority eligible `admin_bank_account` with
`use_for_deposit = true` that has per-tx and daily headroom and is inside its active hours.
The withdrawal side does the mirror lookup on `use_for_withdraw = true` when a request
falls into `ADMIN_SETTLEMENT`.

### 5.2 `P2pWithdrawService`

`create` (validates split policy, generates parts, locks balance),
`cancel` (only while no part is RESERVED or later; releases lock),
`listParts`, `confirmPayment(partId)`, `rejectPayment(partId, reason)`.

Balance lock on create, inside one DB transaction with `pessimistic_write` on the wallet
(same pattern as `DepositService.process`):

```
wallet.freeBalance   -= amount
wallet.lockedBalance += amount
+ TransactionEntity(P2P_WITHDRAW_LOCK, amount = -amount, status = COMPLETED)
```

### 5.3 `P2pDepositService`

`createIntent` (→ matching), `getMatch`, `acceptMatch`, `cancelMatch`,
`submitPaymentProof` (MinIO upload + `OcrService.processImage` → tracking code/amount
extraction; a mismatch against `match.amount` sets `ocr_mismatch` and raises a
`RECEIPT_MISMATCH` escalation instead of blocking the user).

### 5.4 `P2pSettlementService` — the only place balance moves

`settle(matchId, actor)` in one DB transaction:

```
lock withdrawer wallet + depositor wallet (pessimistic_write, ordered by wallet id
  to avoid deadlock)
withdrawer.lockedBalance -= amount      → TX P2P_WITHDRAW_SETTLE (-amount)
depositor.freeBalance    += amount      → TX P2P_DEPOSIT_SETTLE  (+amount)
part.confirmed_amount = amount; part.status = CONFIRMED
request.completed_amount += amount; remaining_amount -= amount
if remaining_amount == 0 → request COMPLETED, withdraw.status = COMPLETED,
                           deposit.status = COMPLETED
audit + events
```

Admin settlement (`SETTLE_FROM_ADMIN`) is the same routine with the admin system wallet on
one side. Refund/reverse writes compensating transactions — never a balance edit or a
delete.

### 5.5 `P2pEscalationService`

`open(matchId, reason, priority)`, `assign`, `resolve(decision)` with the six decision types
(`CONFIRM_PAYMENT`, `REJECT_PAYMENT`, `REQUEST_MORE_EVIDENCE`, `SETTLE_FROM_ADMIN`,
`REOPEN_MATCHING`, `CANCEL_REQUEST`). `resolve` requires a note, writes
`p2p_audit_log` with before/after, and for amounts above
`two_person_approval_threshold` stores a maker decision that a second admin must check.

### 5.6 `P2pSettingService` / `AdminBankAccountService`

`AdminBankAccountService`: CRUD,
`setDirections(id, {useForDeposit, useForWithdraw})`, per-direction limit accounting
(`reserveHeadroom` / `releaseHeadroom` called from settlement inside the same DB
transaction, so a crashed settlement cannot leak limit budget), and
`pickAccount(direction, symbolId, amount)` implementing the selection rules in §3.7.
Reads are Redis-cached (30s) and busted on write. Settings service is the same shape.

---

## 6. Background workers

New `P2pCronService` (`@nestjs/schedule`, same shape as `CreditCronService`). **Every job
first takes a Redis lock** — prod runs multiple replicas, and `@Cron` fires on all of them.
`RedisService` currently has no lock helper, so add:

```ts
async tryLock(key: string, ttlMs: number): Promise<boolean>  // SET key val NX PX ttl
async unlock(key: string, token: string): Promise<void>      // Lua compare-and-del
```

| Job | Interval | Action |
|---|---|---|
| `ReservationExpiryWorker` | 1m | `reserved_until < now` → part back to `OPEN`, match `RESERVATION_EXPIRED`, intent back to `MATCHING` |
| `WithdrawerResponseTimeoutWorker` | 1m | `response_deadline_at < now` → `RESPONSE_TIMEOUT` + escalation `WITHDRAWER_NO_RESPONSE` |
| `SettlementTimeoutWorker` | 1m | `settlement_deadline_at < now` → request `ADMIN_SETTLEMENT` + escalation |
| `MatchingRetryWorker` | 1m | retry `NO_MATCH` intents; after `matching_max_retry` apply admin fallback |
| `RequestExpiryWorker` | 5m | expire stale requests, release remaining locked balance |
| `StuckCaseDetector` | 5m | rows sitting in a non-terminal state past 2× their deadline → alert |
| `DailyLimitReset` | daily 00:00 | reset `deposit_used_today` / `withdraw_used_today` on `admin_bank_account` when `used_today_date` rolls over |
| `ReconciliationWorker` | hourly | assert `Σ confirmed parts == Σ settlement transactions`, and `Σ locked_amount == Σ wallet.lockedBalance` for p2p; mismatch → admin alert |

---

## 7. Settings (seeded defaults, Appendix A)

```json
{
  "settlement_timeout_minutes": 180,
  "withdrawer_response_timeout_minutes": 30,
  "reservation_ttl_minutes": 15,
  "source_priority": { "deposit": "CUSTOMER_FIRST", "withdrawal": "CUSTOMER_FIRST" },
  "matching_weights": { "amount_fit": 40, "parts_fit": 20, "constraints": 20, "age": 10, "priority": 10, "risk": 0 },
  "matching_max_retry": 3,
  "escalation": { "notify_admin_on_reject": true, "notify_admin_on_no_response": true, "require_admin_resolution": true },
  "two_person_approval_threshold": 5000000000,
  "allow_over_under_split": false,
  "request_expiry_hours": 48
}
```

---

## 8. Cross-cutting

### 8.1 Symbol configuration
- `DepositTypeEnum += P2P = "p2p"`, `WithdrawTypeEnum += P2P = "p2p"`.
- `SYMBOL_TYPE_DEPOSIT_MAP[RIAL] = ["manual", "payment-gateway", "p2p"]`,
  `SYMBOL_TYPE_WITHDRAW_MAP[RIAL] = ["manual", "auto", "p2p"]`. Other symbol types
  unchanged — `validateDepositTypes`/`validateWithdrawTypes` already reject `p2p` for them.
- `p2p` is **not** added to `GATEWAY_BOUND_TYPES`, so `PaymentBusService` is never invoked
  and `hasPaymentGateway` is not required.
- `DepositService.create` / `WithdrawService.create` branch to the p2p services when
  `dto.type === "p2p"`, after the existing KYC / cooldown / level-limit checks run. Those
  checks stay in the shared path so p2p inherits them for free.

### 8.2 Security
- KYC-approved + verified `user_bank_account` required to create a p2p withdrawal (the
  destination shown to strangers must be a verified account).
- Account/card numbers masked in every response except for the depositor of an *active*
  reservation and for `FINANCE`/`SUPER_ADMIN`. This covers company accounts too: a
  depositor sees the full destination only while their reservation is live, and it comes
  from `destination_snapshot_json`, not a live join.
- Company bank accounts are `SUPER_ADMIN`-write / `FINANCE`-read; every create, edit,
  direction-flag change and status change is audited with before/after.
- Receipt objects stored in MinIO under `p2p/{matchId}/…`, served only via time-limited
  presigned URLs.
- Rate limits on intent creation, proof submission, and confirm/reject.
- `Idempotency-Key` header (Redis-backed interceptor) required on `payment-proof`,
  `confirm-payment`, `reject-payment`, and `escalations/:id/resolve`.
- IP + user-agent + actor recorded on every state-changing p2p call.

### 8.3 Two-person control
Admin settlement above `two_person_approval_threshold`, any admin-wallet transfer, and any
dispute override: maker records the decision (`p2p_escalation.resolution_type` +
`resolved_by_admin_id`), checker confirms (`checker_admin_id`); settlement only executes on
check.

### 8.4 Notifications
Add `P2pEvents` to `shared/constants/events.constants.ts` and a
`notification/listeners/p2p-event.listener.ts` following the existing deposit/withdraw
listeners. Events: `p2p.matched`, `p2p.proof_submitted`, `p2p.confirmed`, `p2p.rejected`,
`p2p.response_timeout`, `p2p.escalated`, `p2p.escalation_resolved`, `p2p.reservation_expired`.
Admin escalations also go to the existing admin notification gateway with amount, age,
reason, and a deep link.

---

## 9. API surface (`/api/v1`, versioning is already enabled in `main.ts`)

### User — withdrawal
| Method | Endpoint |
|---|---|
| POST | `/api/v1/withdraw` (`type: "p2p"`, with `split` + `constraints`) |
| GET | `/api/v1/p2p/withdrawals/:id/parts` |
| POST | `/api/v1/p2p/withdrawal-parts/:id/confirm-payment` |
| POST | `/api/v1/p2p/withdrawal-parts/:id/reject-payment` |

### User — deposit
| Method | Endpoint |
|---|---|
| POST | `/api/v1/deposit` (`type: "p2p"`) → creates intent + triggers matching |
| GET | `/api/v1/p2p/deposit-intents/:id/match` |
| POST | `/api/v1/p2p/matches/:id/accept` |
| POST | `/api/v1/p2p/matches/:id/cancel` |
| POST | `/api/v1/p2p/matches/:id/payment-proof` (multipart, Idempotency-Key) |

### Admin
| Method | Endpoint |
|---|---|
| GET | `/api/v1/admin/p2p/escalations` (filters: reason, amount, age, priority, user, bank, assignee) |
| GET | `/api/v1/admin/p2p/escalations/:id` (full timeline) |
| POST | `/api/v1/admin/p2p/escalations/:id/resolve` |
| GET/PATCH | `/api/v1/admin/p2p/settings` |
| GET | `/api/v1/admin/p2p/audit-logs` |
| GET | `/api/v1/admin/p2p/dashboard` |
| GET | `/api/v1/admin/p2p/matches` |

### Admin — company bank accounts
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/v1/admin/bank-accounts` | filters: `direction=deposit\|withdraw`, `symbolId`, `status` |
| GET | `/api/v1/admin/bank-accounts/:id` | includes today's usage against both limits |
| POST | `/api/v1/admin/bank-accounts` | create |
| PATCH | `/api/v1/admin/bank-accounts/:id` | edit details, limits, priority, active hours |
| PATCH | `/api/v1/admin/bank-accounts/:id/directions` | set `useForDeposit` / `useForWithdraw` — either, both, or neither |
| PATCH | `/api/v1/admin/bank-accounts/:id/status` | `ACTIVE` / `INACTIVE` / `SUSPENDED` (replaces delete) |

`CreateAdminBankAccountDto`: `title`, `bankName`, `ownerName`, `symbolId`,
`iban?` (`@IsIBAN()`), `accountNumber?`, `cardNumber?`, `useForDeposit?`,
`useForWithdraw?`, `priority?`, the four limit fields, `activeFromHour?`,
`activeToHour?`, `notes?`. At least one of `iban` / `accountNumber` / `cardNumber` is
required.

Roles: `FINANCE` + `ADMIN` + `SUPER_ADMIN` for escalations and settlement;
`SUPER_ADMIN` only for settings, bank-account writes, and the checker step.
`FINANCE` may read bank accounts unmasked; other roles see them masked.

Dashboard cards: pending withdrawals, unmatched intents, waiting-confirmation,
escalated, timeout-risk, admin liquidity, today completed.

---

## 10. Module layout

```
src/p2p/
  p2p.module.ts
  entity/            p2p-withdraw-request | -part | -deposit-intent | -match
                     | -payment-proof | -escalation | -setting | -audit-log
  enum/              (one file per state machine + reasons + decisions)
  state/transitions.ts
  dto/
  services/          matching | withdraw | deposit | settlement | escalation
                     | setting | audit
  p2p-withdraw.controller.ts
  p2p-deposit.controller.ts
  p2p-admin.controller.ts
  p2p-cron.service.ts
  listeners/

src/admin-bank-account/          # shared, not p2p-scoped
  admin-bank-account.module.ts
  entity/admin-bank-account.entity.ts
  enum/admin-bank-account-status.enum.ts
  dto/
  admin-bank-account.service.ts
  admin-bank-account.controller.ts   # /api/v1/admin/bank-accounts
```

Both registered in `app.module.ts` after `WithdrawModule` (`AdminBankAccountModule` first —
`P2pModule` depends on it). Migrations:
`src/migrations/1000000000090-adminBankAccountMig.ts` (the shared table + its two partial
indexes) and `1000000000091-p2pMatchingMig.ts` (p2p tables + indexes + settings seed +
`p2p` appended to rial symbols' `deposit_types` / `withdraw_types`).

---

## 11. Phasing

| Phase | Scope | Exit criterion |
|---|---|---|
| 1 | Enums + symbol map + migration + entities + `p2p` withdrawal creation with balance lock + parts generation + deposit intent | A withdrawal splits correctly; balance is locked; intents persist |
| 2 | Matching engine + reservation (`FOR UPDATE SKIP LOCKED`) + reservation-expiry worker | Two concurrent depositors race one part; exactly one wins |
| 3 | Payment proof (MinIO + OCR) + withdrawer confirm/reject + settlement service + ledger transactions | 500+300+200 fills a 1B EXACT=3 request; balances conserved |
| 4 | Escalation entity + queue + response-timeout and settlement-timeout workers + notifications | Reject and no-response both produce an OPEN escalation, no auto-settle |
| 5 | `admin_bank_account` CRUD + direction flags + per-direction limits; admin liquidity settlement + `SETTLE_FROM_ADMIN` + `ADMIN_FIRST` policy | An account flagged for both directions is offered to depositors *and* used for payouts; policy flip changes matching source correctly |
| 6 | Settings UI surface + scoring weights + reports/KPIs + reconciliation worker | Reconciliation reports zero mismatch on a seeded dataset |
| 7 | Hardening: idempotency interceptor, rate limits, masking, two-person approval, load/concurrency tests | Acceptance list §12 green |

---

## 12. Acceptance tests (from spec §15)

1. Create a 1,000,000,000 IRR withdrawal with `EXACT = 3`; three parts generated.
2. Deposits of 500M + 300M + 200M confirm the request; `completed_amount == total_amount`.
3. Two depositors reserve the same part concurrently → exactly one winner, the other
   is re-matched or queued.
4. Proof submission + withdrawer confirmation → paired ledger transactions, balances
   conserved platform-wide.
5. Withdrawer rejects → escalation `WITHDRAWER_REJECT`, status `OPEN`, no settlement.
6. Withdrawer silent past `response_deadline_at` → `WITHDRAWER_RESPONSE_TIMEOUT` +
   escalation + admin & customer notifications + **no** automatic settlement.
7. Admin resolves with `SETTLE_FROM_ADMIN` → admin wallet debited, depositor credited,
   audit written.
8. Flip `source_priority.deposit` to `ADMIN_FIRST` → matching prefers admin accounts.
9. Reservation TTL elapses → part returns to `OPEN` and is matchable again.
10. Re-POSTing a payment proof with the same `Idempotency-Key` returns the first result
    and creates no second proof.
11. A `COMPLETED` match cannot be mutated through any normal API path.
12. Every state change and settings change produces a `p2p_audit_log` row with
    before/after.
13. An account flagged **deposit only** never appears as a payout source; **withdraw only**
    is never offered to a depositor; **both** is used in each direction, and each direction
    draws down its own daily counter independently.
14. An account at its `deposit_daily_limit` is skipped for the next depositor and the
    next-priority account is chosen; when none is eligible an `ADMIN_ACCOUNT_UNAVAILABLE`
    escalation opens instead of a silent customer fallback.
15. Deactivating an account mid-flight does not change the destination already shown to a
    depositor (`destination_snapshot_json`), and the in-flight match still settles.

---

## 13. Risks / open questions for the product owner

1. **Fees.** The spec keeps only base fee fields in v1. Do p2p deposits/withdrawals carry a
   fee, and who pays it — depositor, withdrawer, or neither? Currently planned as
   fee-free, with the columns present but zero.
2. **Refund semantics.** If an admin rejects a payment after the depositor really did send
   money, the platform has no way to return bank funds. `REJECT_PAYMENT` therefore only
   closes the internal record; the actual refund is an off-platform operations task that
   must be recorded as a note. Confirm this is acceptable.
3. **Withdrawer bank account.** Plan assumes exactly one verified `user_bank_account` per
   user (the entity has a unique `user_id`). If withdrawers must choose among several
   accounts, that uniqueness constraint has to be lifted first.
4. **Under/over split.** `allow_over_under_split` defaults to false, so a deposit amount
   must exactly match a part's remaining amount. Allowing partial fills of a part is a
   meaningfully larger matching change — flagged, not built, in v1.
5. **User trust / abuse.** Nothing here scores a user's reject rate yet (`W_RISK` is 0).
   A repeat-offender withdrawer can grief depositors. Worth a follow-up: feed
   reject/no-response rate into `risk_score`.
6. **Company account scope.** `admin_bank_account` is planned per-symbol
   (`symbol_id` FK), on the assumption that a rial account settles rial only. If one
   account should serve several symbols, that becomes a join table — cheap now, expensive
   after go-live.
7. **Reconciling the real bank leg.** The platform records *that* an admin account paid or
   was paid, not that the bank agrees. `shahin` already ingests bank statement entries
   (`shahin_entry`); matching those against `admin_bank_account` movements would close the
   loop automatically. Out of scope for v1 — flagging it as the natural phase-8.
