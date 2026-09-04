# Parszargar UI × Goldex — Backend Implementation Plan

> Companion document to `ui-parszargar/PARSZARGAR-GOLDEX-PLAN.md`
> (repo `CaptainFeri/ui-parszargar`, branch `claude/ui-goldex-admin-plan-40u9fs`).
>
> This file covers only the **`goldex-backend` changes** required to make the
> Parszargar admin UI run on real data. The frontend plan covers the mirror
> side: wiring the UI and importing the Goldex admin-panel feature set.

---

## 0. Where we are

| | `goldex-admin-panel` | `ui-parszargar` |
|---|---|---|
| Stack | React 18 + **TS**, Vite 5, react-query, axios, chart.js, socket.io | React 19 + **JS**, Vite 8, react-router v7, framer-motion, recharts |
| Pages | 57 files / 38 routes | 41 pages / 73 nav entries |
| Data | Live `/api/v1` | **100% mock — zero API calls** |
| Auth | phone+password → OTP → JWT, `HEAD /admin/auth/auth` probe, 401 interceptor | hardcoded `admin@goldex.ir` / `GoldEx@2026` in `Login.jsx` |
| Design | 1,030-line functional CSS, emoji icons | 5,914-line gold/RTL design system, lucide icons, dark+light |

`goldex-backend` today: **57 controllers, 74 entities, 54 modules**, NestJS,
global prefix `api` + URI versioning `v1` → every route is `/api/v1/...`.

The strategic read: **Parszargar is the better shell, Goldex is the better
engine.** The target is one panel — Parszargar's UI on Goldex's API — which
means the backend has to grow the ~8 domains Parszargar assumes but Goldex
has never modelled.

---

## 1. What already exists and just needs wiring (no backend work)

These Parszargar screens map onto endpoints that are already shipped. They are
**frontend-only** tasks; listed here so nobody re-implements them.

| Parszargar page | Existing backend |
|---|---|
| `KycPage` / `KycDetailPage` | `admin/kyc/*` — pending, all, stats, users, approve, reject, reject-multiple, documents |
| `UsersPage` / `UserCreatePage` | `admin/users/*` — stats, online, list, detail, activation, role, market-types, market-kinds, partners |
| `WalletsPage` / `WalletDetailsPage` | `admin/wallets/*` — all-wallets, detail, update-balance, adjust-balance, freeze, update-status, history |
| `WalletOperationsPage` | `admin/financial/transactions`, `admin/wallets/:id/history` |
| `TradesPage` | `admin/orders`, `admin/orders/book/:pairId`, `admin/orders/:id` |
| `PricePage` | `admin/monitoring/*` (providers, history, current, best-prices, market-map, consolidated-market), `admin/pair/*` |
| `WarehousePage` / `WarehouseSearchPage` | `admin/warehouse/*` — 28 endpoints incl. packets, requests, allocation-suggestions, settlement-material |
| `WithdrawalsPage` | `admin/withdraw/*` + `admin/deposit/*` |
| `WithdrawalProvidersPage` | `admin/provider-finance/{overview,settlements,settle}` |
| `CreditPage` | `admin/credits/*` — ~40 endpoints incl. the full settlement workflow |
| `NotificationsPage` | `admin/notifications/*` + `admin/notifications/templates/*` |
| `SupportPage` (stub) | `admin/crm/tickets/*` |
| `CustomerOverviewPage` (stub) | `admin/crm/users/:userId/360` |
| `ShahinPage` (statement/transfer/balance) | `api/shahin/*` — accounts, entries, balance, statement, transfer, batch-transfer |

**One caveat on Shahin:** `ShahinProxyController` is declared
`@Controller('api/shahin')` while the app already sets a global `api` prefix
and `v1` version — so it resolves to `/api/v1/api/shahin/*`. Normalise it to
`admin/shahin` (§2.9) before the UI hard-codes the double prefix.

---

## 2. New backend work

Nine domains. Ordered by dependency, not by size — §2.1 gates the whole panel.

### 2.1 — RBAC v2: custom roles & permissions  🔴 blocker

**Today:** `AdminRole` is a 4-value enum (`superAdmin | admin | finance |
warehouse`) with a static `RolePermissions` map and a numeric `RoleHierarchy`,
checked by `admin.role.guard.ts`. There is no role table.

**Parszargar assumes** (`src/data/rolesMock.js`, `RolesPage`, `RoleCreatePage`,
`RoleDetailPage`): named custom roles, a 22-key permission matrix, and
**per-role operational limits** — allowed wallet types, trading fee %, daily
withdrawal ceiling, official/unofficial classification, credit allowance,
member count.

**New module** `src/admin-role/`:

```
admin-role/
├── entity/admin-role.entity.ts          # id, name, isSystem, roleType(official|unofficial|both),
│                                        # walletTypes: SymbolTypeEnum[], feePercent, dailyWithdrawalLimit,
│                                        # hasCredit, creditAmount
├── entity/admin-permission.entity.ts    # key, group, label  (seeded, immutable)
├── entity/admin-role-permission.entity.ts
├── admin-role.controller.ts             # @Controller("admin/roles")
├── admin-role.service.ts
└── seed/permissions.seed.ts
```

| Method | Path | Notes |
|---|---|---|
| `GET` | `admin/roles` | list + `memberCount` (join on admin) |
| `POST` | `admin/roles` | create |
| `GET` | `admin/roles/:id` | detail |
| `PATCH` | `admin/roles/:id` | edit — reject when `isSystem` |
| `DELETE` | `admin/roles/:id` | reject when `isSystem` or `memberCount > 0` |
| `GET` | `admin/roles/permissions` | the full permission catalogue for the matrix UI |
| `GET` | `admin/roles/:id/permissions` | assigned keys |
| `PUT` | `admin/roles/:id/permissions` | replace the set |
| `GET` | `admin/roles/:id/members` | admins holding the role |

Changes elsewhere:
- `AdminEntity.role` (enum column) → nullable `roleId` FK + keep the enum column
  through one release for rollback; migration seeds the 4 legacy enum values as
  `isSystem` roles and backfills every admin.
- `admin.role.guard.ts` gains a permission path: `@RequirePermissions('kyc_approve')`
  resolves against `role.permissions`, with the enum hierarchy as fallback while
  both columns exist.
- `verify-otp` response must return `permissions: string[]` — the Parszargar
  shell hides nav groups off that list.
- Enforce the limits where they bite: `feePercent` in order pricing,
  `dailyWithdrawalLimit` in `withdraw-admin`, `walletTypes` as a filter in
  `admin-wallet`.

**Risk:** touching the guard touches every admin route. Land the entities and
the read endpoints first, flip the guard in a separate PR behind
`ADMIN_RBAC_V2=true`.

### 2.2 — Accounting: vouchers & the Jalali ledger

**Today:** `system-ledger.entity.ts` and `finance-log` are append-only audit
trails. There is **no voucher, no chart of accounts, no period aggregation**.

**Parszargar assumes** `AccountingDocumentPage` (voucher CRUD:
`voucherId`, customer, `detail`/`extraDesc`, formal/informal, currency, amount,
debit/credit side, status `draft | pending | final`, `createdBy`) and
`AccountingPage` (income / expense / profit / margin aggregated by Jalali
year → month → day → hour, plus a general-ledger table).

**New module** `src/accounting/`:

```
accounting/
├── entity/account.entity.ts           # chart of accounts: code, name, type(asset|liability|equity|income|expense), parentId
├── entity/voucher.entity.ts           # voucherNo, jalaliDate, gregorianDate, customerId, customerType,
│                                      # description, extraDescription, status, createdByAdminId, approvedByAdminId
├── entity/voucher-line.entity.ts      # voucherId, accountId, side(debit|credit), symbolId, amount, description
├── accounting-admin.controller.ts     # @Controller("admin/accounting")
├── voucher.service.ts                 # balance invariant: Σ debit === Σ credit per voucher
└── ledger.service.ts                  # aggregation + Jalali bucketing
```

| Method | Path |
|---|---|
| `GET/POST` | `admin/accounting/vouchers` (list w/ filters: date range, type, currency, status, `searchKey`) |
| `GET/PATCH/DELETE` | `admin/accounting/vouchers/:id` (edit & delete only while `draft`) |
| `POST` | `admin/accounting/vouchers/:id/submit` · `/approve` · `/reject` |
| `GET` | `admin/accounting/vouchers/export` (xlsx/csv) |
| `GET` | `admin/accounting/accounts` + `POST/PATCH/DELETE :id` |
| `GET` | `admin/accounting/ledger?from&to&interval=month\|day\|hour&metric=income\|expense\|profit\|margin` |
| `GET` | `admin/accounting/summary?from&to` (the four KPI cards) |

Decisions to lock before coding:
- **Jalali** — store `gregorianDate timestamptz` as the source of truth plus a
  denormalised `jalali_date char(10)` for grouping. Do the calendar conversion
  server-side (`jalaali-js`); do **not** ship raw Gregorian and convert in the
  browser, or the year/month buckets drift at boundaries.
- **Multi-currency** — voucher lines carry `symbolId`; the ledger aggregates in
  a base symbol using the rate at `gregorianDate`. Needs a
  `getRateAt(symbolId, at)` helper on the pricing side.
- Vouchers post to the ledger **only on `approve`**. Drafts never move balances.

### 2.3 — Reports service

**Today:** three ad-hoc exports (`warehouse/today-export`, `credits/export`,
`finance-logs/export`). No report definitions, no scheduling, no artifacts.

**Parszargar assumes** `ReportsPage`: report types (معاملات / کاربران / مالی /
برداشت‌ها / آربیتراژ), formats (PDF / Excel / CSV), scheduled runs, run
duration, download history.

**New module** `src/reports/` with `report-definition`, `report-run`
(status `queued|running|succeeded|failed`, `durationSec`, `artifactObjectName`)
and `report-schedule` (cron + recipients) entities.

| Method | Path |
|---|---|
| `GET` | `admin/reports/definitions` (catalogue: type, params schema, formats) |
| `POST` | `admin/reports/run` → `{ runId }`, executed async |
| `GET` | `admin/reports/runs?type&from&to&status` |
| `GET` | `admin/reports/runs/:id` · `GET .../download` (presigned MinIO URL) |
| `GET/POST` | `admin/reports/schedules` · `PATCH/DELETE :id` · `POST :id/run-now` |

Execution rides `@nestjs/schedule` (already imported in `app.module.ts`) for the
cron and MinIO (already wired) for artifacts. Generators are per-type strategies
that reuse the existing financial/order/user/withdraw services — do not
re-query raw tables.

### 2.4 — Partners

`admin/users/partners` only mints a *partner user*. Parszargar's `PartnersPage`
/ `PartnerCreatePage` model a **business partner network**: name, category
(درگاه پرداخت / تأمین نقدینگی / تسویه ریالی / نرخ ارز / بازارگردان /
نگهداری فیزیکی), contract open|closed, working status, contacts, commercial
terms.

New `src/partner/` — `partner.entity.ts` + `partner-contact.entity.ts`, with
`GET/POST admin/partners`, `GET/PATCH/DELETE admin/partners/:id`,
`PATCH admin/partners/:id/status`, and `GET admin/partners/stats` for the KPI
strip. Optional `linkedUserId` / `linkedProviderId` so a partner row can point
at the existing partner-user or provider record instead of duplicating it.

### 2.5 — Infrastructure health (Parszargar's "Providers" page)

Careful: `ProvidersPage` in Parszargar is **not** `admin/providers`. Its filter
list is `server, accountingServer, sms, version, logs, disk, auth1, auth2, ocr1,
ocr2, bale, eitaa, telegram` — it is an **ops/infra health board**, and
`Monitoring.jsx` (provider latency, uptime, incidents) is its sibling.

New `src/infra-health/`:
- `GET admin/infra/health` — one aggregated snapshot per component, each
  `{ key, category, status, latencyMs, uptimePct, version, lastCheckedAt }`.
- `GET admin/infra/components/:key/history?from&to`
- `GET admin/infra/incidents?status&from&to` + `PATCH .../:id/acknowledge`
- `entity/infra-incident.entity.ts`, `entity/health-sample.entity.ts`

Probes: a `@Cron` sampler hitting the existing service health endpoints
(`ocr/health`, `admin/cbp/health`, pricing-engine, RabbitMQ, Redis, Postgres,
disk via `statfs`, SMS provider balance). Retain samples 30 days, roll up daily
after that.

`Monitoring.jsx`'s provider view is served by extending
`admin-monitoring` with `GET admin/monitoring/uptime?provider&from&to`
computed from the same samples.

### 2.6 — Arbitrage robots

`admin/arbitrage` today is a **read-only scanner** (`opportunities`, `alerts`,
`last-scan`, `status`, `history`) plus a single global `GET/PATCH config` and a
manual `POST scan`. Parszargar's `ArbitragePage` + `RobotFormPage` +
`RobotMultiSelect` model **named robots with their own configuration and P&L**.

Extend `admin-arbitrage` with `entity/arbitrage-robot.entity.ts`
(name, pairIds, providerKeys, budget, minSpreadPct, maxOrderSize, schedule,
`status: draft|active|paused|stopped`) and
`entity/arbitrage-robot-run.entity.ts` (executions + realised profit):

`GET/POST admin/arbitrage/robots` · `GET/PATCH/DELETE admin/arbitrage/robots/:id` ·
`POST admin/arbitrage/robots/:id/{start,pause,stop}` ·
`GET admin/arbitrage/robots/:id/{runs,stats}`.

The executor belongs in `goldex-pricing-engine` (it already owns the scanner and
the provider sockets); the backend owns config + results and talks to it over
the existing RabbitMQ channel. **Ship config CRUD + a read-only `stats` first**;
live execution is a separate, riskier phase.

### 2.7 — textId

`TextIdPage` / `TextIdDetailPage` look up a transaction by a human-facing
reference and emit a document. Nothing in the backend exposes such an id today.

Cheapest correct route: add a `text_id` column (indexed, unique) to
`TransactionEntity`, generated on insert (`TX` + base32 of the sequence), then:

- `GET admin/text-id?from&to&type&currency&searchKey` — the list
- `GET admin/text-id/:textId` — detail, joined to user + order + wallet
- `GET admin/text-id/:textId/document` — PDF receipt

Backfill existing rows in the migration. If a reference already exists somewhere
in `finance-log`, prefer projecting that over minting a new identifier —
**confirm with the product owner before writing the migration.**

### 2.8 — System settings & defaults

`SettingsPage` and `DefaultsPage` have no backend at all (`DefaultsPage` is one
of four stub pages). Add a generic, typed, audited key–value store:

`src/system-setting/` — `entity/system-setting.entity.ts`
(`key, group, valueJson, valueType, label, description, isSecret, updatedByAdminId`)
+ `entity/system-setting-history.entity.ts`.

`GET admin/settings?group=` · `GET admin/settings/:key` ·
`PUT admin/settings/:key` · `PUT admin/settings/bulk` ·
`GET admin/settings/:key/history`.

Secrets are write-only over the API (returned masked). Seed the groups
Parszargar shows: trading defaults, fee defaults, withdrawal limits,
notification toggles, KYC thresholds, session policy.

### 2.9 — Smaller items

- **Shahin path fix** — `@Controller('api/shahin')` → `@Controller('admin/shahin')`
  (currently resolves to `/api/v1/api/shahin`). Guard it with the admin guard;
  it is unauthenticated-looking today — **verify before assuming it is safe.**
- **Open-banking tab** (`ShahinPage`) — no backend. Either drop the tab or spec
  it; do not wire it to the transfer endpoints.
- **API key management** — `ApiPage` (keys, monthly quota, traffic chart) has no
  backend and no consumer. Recommend **deferring**: it is a public-API product
  decision, not an admin-panel gap.
- **Warehouse beyond material** — `WarehouseDocumentPage` offers
  material / crypto / rial / fiat warehouses; the warehouse module is
  material-only. `SymbolTypeEnum` is already `fiat|crypto|material|rial`, so the
  extension is a `symbolType` discriminator on `WarehouseEntity` + relaxing the
  material-only guards in `warehouse.service`.
- **Admin session `permissions`** — see §2.1; the shell needs it at login.

---

## 3. Alignment notes worth keeping

- `SymbolTypeEnum` = `fiat | crypto | material | rial` maps **exactly** onto
  Parszargar's wallet-detail tabs (فیات / کریپتو / متریال / ریال) and its
  warehouse document types. Use the enum verbatim; do not invent a parallel
  vocabulary in the UI.
- `WalletEntity` already carries `freeBalance / lockedBalance / creditBalance /
  frozenFreeBalance / frozenLockedBalance`, which covers Parszargar's
  available / credit / frozen buckets in `WalletOperationsPage` with **no schema
  change**.
- Every response is wrapped by `ResponseInterceptor` as
  `{ status, message, data, errors }` — the UI's client must unwrap, exactly as
  `goldex-admin-panel/src/api/client.ts:unwrap()` does.

---

## 4. Phasing

| Phase | Content | Gate |
|---|---|---|
| **B0** | Shahin path fix · `permissions` in verify-otp · `admin/settings` skeleton | UI can authenticate and boot a permission-aware shell |
| **B1** | RBAC v2 (§2.1) — entities, endpoints, migration, seed; guard behind a flag | `RolesPage` runs on real data |
| **B2** | Accounting (§2.2) | `AccountingPage` + `AccountingDocumentPage` |
| **B3** | Partners (§2.4) · textId (§2.7) · Settings/Defaults content (§2.8) | four stub pages become real |
| **B4** | Infra health (§2.5) · monitoring uptime | `ProvidersPage` + `Monitoring` |
| **B5** | Reports (§2.3) | `ReportsPage` |
| **B6** | Arbitrage robots — config CRUD (§2.6) | `RobotFormPage` |
| **B7** | Arbitrage execution in pricing-engine · warehouse multi-type (§2.9) | — |
| **Deferred** | API keys · Shahin open-banking | product decision needed |

B1–B6 are independent of one another once B0 lands and can run in parallel.

---

## 5. Open questions for the product owner

1. **RBAC** — do the per-role limits (fee %, daily withdrawal cap, credit
   allowance) govern *admins* or the *end users the admin manages*? The
   Parszargar mock reads as admin-scoped, which is unusual; the answer changes
   where enforcement lives.
2. **Accounting** — is this a real double-entry ledger of record, or a
   reporting overlay on `system-ledger`? §2.2 assumes the former.
3. **textId** — does a transaction reference already exist in an upstream
   system, or do we mint it? (§2.7)
4. **Two panels or one?** This plan assumes Parszargar becomes *the* admin panel
   and `goldex-admin-panel` is retired after parity. If both must live, every
   new endpoint needs to be consumed twice.
5. **Arbitrage robots** — do they place real orders, or are they alert/paper
   configurations? §2.6 phases this deliberately.
