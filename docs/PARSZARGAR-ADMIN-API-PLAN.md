# Pars Zargar Admin Panel — API Implementation Plan

Plan for the backend work needed to make the **`ui-parszargar`** admin SPA run on
real data instead of the in-file mocks it ships with today.

- **Frontend:** `CaptainFeri/ui-parszargar` — React 19 + Vite + react-router 7,
  RTL Persian, 41 routed pages, ~20k LOC, currently 100% mock/generated data.
- **Backend:** `CaptainFeri/goldex` → `goldex-backend` — NestJS 11 + TypeORM +
  Postgres + Redis + RabbitMQ + MinIO + Socket.IO. Already the same product
  (its response logger literally prints `P=A=R=S=Z=A=R=G=A=R`), so this is an
  **extension of an existing API**, not a greenfield build.

The plan is organised as: conventions → cross-cutting platform work → a
page-by-page endpoint specification → new data model → delivery phases.

---

## 1. How the plan was derived

Every page under `ui-parszargar/src/pages` and `src/components` was read and
reduced to three things:

1. **Reads** — what the page renders (KPI cards, charts, tables, detail panes).
2. **Writes** — every button that mutates state (approve, reject, toggle,
   create, delete, OTP-guarded money movement).
3. **Filters** — search modes, ranges, date pickers, pagination, drill-downs.

The UI already contains explicit backend placeholders that fix part of the
contract; those are honoured verbatim where sensible:

| File | Placeholder |
|---|---|
| `components/auth/ForgotPasswordPage.jsx` | `POST /api/auth/forgot`, `POST /api/auth/reset` |
| `components/auth/SupportPage.jsx` | `POST /api/support` |
| `pages/UsersPage.jsx` | `POST /api/users/search`, `POST /api/users/range` |
| `pages/UserCreatePage.jsx` | `POST /api/users` with snake_case body |
| `pages/KycPage.jsx` | `POST /api/kyc/search` |
| `pages/WithdrawalsPage.jsx` | `POST /api/withdrawals/{id}/request-code`, `POST /api/withdrawals/search`, `POST /api/withdrawals/action` |

> **Deviation, deliberate:** these placeholders use `POST` for search. The plan
> standardises on `GET` + query params for all list/search endpoints (cacheable,
> shareable, matches the rest of `goldex-backend`). The frontend change is a
> two-line edit inside each `run*Api` helper, which are already isolated
> functions written for exactly this swap.

---

## 2. What already exists in `goldex-backend`

Roughly 60% of the surface the UI needs is already implemented. Inventory of
admin-facing controllers:

| Controller | Prefix | Covers UI page |
|---|---|---|
| `AdminAuthController` | `v1/admin/auth` | Login / OTP |
| `AdminUserController` | `admin/users`, `admin/partners` | Users, Partners |
| `AdminKycController` | `admin/kyc` | KYC, KYC detail |
| `AdminManagementController` | `admin/accounts` | (admin accounts, not roles) |
| `AdminWalletController` | `admin/wallets` | Wallets, Wallet details |
| `AdminOrderController` | `admin/orders` | Trades |
| `AdminFinancialController` | `admin/financial` | Accounting, Dashboard |
| `FinanceLogController` | `admin/finance-logs` | Accounting ledger |
| `CreditAdminController` | `admin/credits` | Credit (very complete) |
| `WithdrawAdminController` | `admin/withdraw` | Withdrawals |
| `DepositAdminController` | `admin/deposit` | Wallet operations |
| `AdminWarehouseController` | `admin/warehouse` | Warehouse × 3 |
| `ShahinProxyController` | `api/shahin` | Shahin |
| `ProviderFinanceController` | `admin/provider-finance` | Provider settlement |
| `AdminMonitoringController` | `admin/monitoring` | Monitoring, Price |
| `AdminArbitrageController` | `admin/arbitrage` | Arbitrage |
| `AdminSymbolController` / `AdminPairController` | `admin/symbols`, `admin/pair` | Price engine |
| `ProviderController` | `admin/providers` | Providers (gold only) |
| `AdminNotificationController` + templates | `admin/notifications` | Notifications |
| `AdminCrmController` | `admin/crm` | Support, Customer overview, Marketing |
| `UserLevelController` | `admin/user-levels` | Roles (partially) |
| `DiscountAdminController` | `admin/discounts` | Marketing |
| `CbpAdminController` | `admin/cbp` | Payments |
| `P2pAdminController` | `admin/p2p` | Withdrawal EM (closest analogue) |
| `AdminBankAccountController` | `admin/bank-accounts` | Shahin accounts |

Enums that already line up with the UI vocabulary — **reuse, do not re-invent**:

- `SymbolTypeEnum = fiat | crypto | material | rial` ↔ UI فیات/کریپتو/متریال/ریال
- `MarketTypeEnum = formal | informal` ↔ UI رسمی/غیررسمی
- `WalletStatusEnum = ACTIVE | FROZEN | SUSPENDED | CLOSED` ↔ UI فعال/مسدود/در انتظار
- `WalletEntity` already has `availableBalance` / `creditBalance` /
  `frozenFreeBalance` — exactly the three buckets `WalletOperationsPage` shows
  (در دسترس / اعتبار / فریز).

### The real gaps

1. **Dynamic roles & permissions.** Backend has a fixed 4-value `AdminRole`
   enum. The UI has full role CRUD with a 22-permission matrix, per-wallet fee /
   withdrawal / credit config, and currency-pair whitelists.
2. **Operation OTP.** Five different pages gate money movement behind a 60-second
   OTP. Nothing generic exists.
3. **Accounting vouchers.** `AccountingDocumentPage` is a double-entry voucher
   register (بدهکار/بستانکار, draft→pending→final). `finance-log` is a log, not a
   voucher book.
4. **EM withdrawals — a *view* gap, not a capability gap.** Confirmed as the
   existing rial P2P settlement desk, so the multi-receipt requests, expiry and
   printable receipts all project off `p2p_*` (§5.17). What is missing is the
   admin-side read model, not the mechanism.
5. **The rial unit itself.** Everything below the bank adapters is denominated
   in a symbol whose slug is `IRR`; the panel is IRT throughout. This is the
   one gap that has to close before any other work lands (§3.1).
6. **Service-provider registry.** `ProvidersPage` tracks 13 *infrastructure*
   categories (servers, SMS, OCR, Bale/Eitaa/Telegram, disks, logs, versions) —
   the existing `admin/providers` only knows gold price providers.
7. **API keys, reports, defaults, platform settings** — none exist. Infra
   monitoring exists but lives in the standalone `monitor` app and is neither
   authenticated nor persisted (§5.4).
8. **Dashboard aggregation.** No single endpoint feeds the 4-way KPI-filtered
   dashboard.

---

## 3. API conventions

These are already partly enforced by `main.ts`; the plan makes them explicit and
uniform for every new endpoint.

### Base and versioning
```
https://<host>/api/v1/...
```
`app.setGlobalPrefix("api")` + URI versioning, `defaultVersion: "1"`. **Existing
admin controllers omit the version and therefore answer on `/api/...` only** —
part of Phase 0 is adding `version: "1"` to every admin controller and keeping
`/api/<path>` alive as a deprecated alias for one release.

### Envelope
`ResponseInterceptor` already wraps everything:
```jsonc
{ "status": 200, "message": "OK", "data": { } }
```
`HttpExceptionFilter` + `nestjs-i18n` produce the error shape. The panel is
Persian, so the client must send `Accept-Language: fa` and render
`message` directly in the toast.

```jsonc
{ "status": 422, "message": "مبلغ برداشت از سقف روزانه بیشتر است",
  "error": { "code": "WITHDRAW.LIMIT_EXCEEDED", "fields": { "amount": "..." } } }
```

### Pagination
One shape everywhere (the current `pageNumber`/`pageSize` in `admin-user` gets an
alias, then is deprecated):
```
?page=1&pageSize=20&sort=createdAt&order=desc
```
```jsonc
{ "items": [], "total": 240, "page": 1, "pageSize": 20, "totalPages": 12 }
```
Page sizes the UI actually uses: 6 (`WalletOperations`, `Withdrawals`), 9
(`Partners`, price cards), 10 (`Shahin`, `EM`, provider settlement), 12 (`KYC`).
Cap `pageSize` at 100.

### Search
Every list endpoint takes the same trio, mirroring the UI's "نوع جستجو" selector:
```
?q=<term>&searchBy=<field>&status=<enum>&from=<date>&to=<date>&min=<num>&max=<num>
```
`searchBy` values are enumerated per endpoint in §5 and must match the `<option value>`
strings already in the JSX so no mapping table is needed on the client.

### Numbers, money, digits
- **API speaks ASCII digits only.** The UI owns Persian digits (`toFa`/`toEn` in
  `utils/helpers.js`); never send `۱۲۳`.
- Monetary and weight values are **decimal strings**, not JS numbers
  (`WalletEntity` is `decimal(20,8)` — `Number` would lose precision on
  ounce/BTC values).
- Every amount field is accompanied by its unit metadata so the UI can label it:
  ```jsonc
  { "amount": "125000000.00000000", "currency": "IRT", "unit": "تومان", "decimals": 0 }
  ```
- **The unit is IRT (تومان), end to end — decided.** Not "store rial, divide at
  the edge": the `IRR` symbol row is replaced by `IRT` and every stored balance
  is converted once, by migration. See §3.1. The only place rial survives is the
  bank-rail adapter boundary (§3.2), because SATNA/PAYA/Shahin/CBP settle in
  rial and that is not ours to change.

### 3.1 The IRR → IRT migration

This is a **data migration, not a serialisation choice**, and it is the riskiest
single item in the plan. `IRR` today is a seeded `symbol` row
(`initSymbolPairMig1000000000028`, `symbolType: "rial"`,
`hasPaymentGateway: true`) that wallets, pairs, transactions, credits and user
levels all point at by FK, plus a hardcoded `"IRR"` string in at least
`credit.service.ts`, `financial.service.ts`, `user-level.service.ts` and
`provider-deal.consumer.ts`.

**Step 1 landed** — `1000000000093-rialToTomanSymbolMig.ts`. It renames the
symbol in place (id preserved, so no FK moves), rewrites the free-text slug
references in `provider_deal_snapshots.base_symbol` / `.quote_symbol` and
`provider_settlements.symbol`, and adds the ticker/instrument columns
(`ticker_key`, `is_ticker`, `display_order`, `category`). Verified against a
real Postgres: up → down → up round-trips, the symbol id survives, and all 93
migrations run clean from an empty database.

It deliberately does **not** touch balances, and that has a consequence worth
stating plainly: **between step 1 and step 2 the database is self-inconsistent.**
The seeded pair becomes `XAU/IRT` while its price is still the rial figure
(74,626,865.67 rather than 7,462,686.567). The two migrations must ship in the
same release, behind maintenance mode. Never deploy step 1 alone.

**Step 2, the ÷10 conversion, is blocked on four denomination decisions.** The
column inventory below was taken from the live schema, not inferred from
entities. Most columns are unambiguous; these are not, and a wrong guess on any
of them is a factor-of-ten error in production money:

| Column | Question |
|---|---|
| `transaction.price` | `amount` is in the wallet's symbol, but `price` looks quote-denominated — for a gold wallet the amount is grams while the price is rial per gram. Scoping the conversion by wallet symbol would therefore be wrong for `price`. Which is it? |
| `order.bridge_rate` | A rate between two symbols. Whether it needs ÷10 depends on which leg is the rial one. |
| `symbol.gain` | Paired with `gain_type`: when `number`, is it an absolute amount in the quote symbol (convert) or something else? When `percent`, no conversion either way. |
| `discount_coupon.discount_amount` | Carries no symbol linkage at all in the schema. What is it denominated in? |

Resolved while taking the inventory, for the record:

- **Do not convert** `price_pairs.min_buy` / `max_buy` / `min_sell` / `max_sell` —
  seeded as `0.001` and `10` on the XAU pairs, so they are base quantities, not
  quote money.
- **Do not convert** `buy_commission`, `sell_commission`, `order.commission` —
  `decimal(10,2)` percentages.
- **Do not convert** `shahin_accounts.balance`, `shahin_entries.amount`, or
  `shahin_entries.currency` — bank-side, and rial there is correct (§3.2).
- **Do not convert** `packet.*`, `warehouse.capacity_*`, `warehouse_request.weight` —
  weights and capacities, not currency.
- Columns denominated in a *collateral or asset* symbol rather than the credit
  base (`credit.collateral_amount`, `collateral_lock.amount`,
  `credit_cashout.asset_amount`) convert only when that symbol is the rial one —
  they need their own scoping clause, not the credit base's.

The remaining steps, once those four are answered:

1. ~~**Symbol row**~~ — done in step 1: updated in place, id kept so no FK moves:
   `slug: IRR → IRT`, `name: "ریال ایران" → "تومان ایران"`,
   `pic_path: /icons/irr.png → /icons/irt.png`. Updating beats
   delete-and-insert; a new id would orphan every wallet.
2. **Divide by 10**, everywhere that column is denominated in the rial symbol:
   `wallet.free_balance / locked_balance / available_balance / credit_balance /
   frozen_free_balance`, `transaction.amount` (+ fee columns),
   `price_pairs.price` where `quote_id = IRT` (the seeded `XAU/IRR`
   74,626,865.67 becomes `XAU/IRT` 7,462,686.567 — note the precision, the
   column is `decimal(20,8)` and survives it), credit principal/limit/collateral
   valuations, `user_level.credit_max_amount`, provider-deal snapshots,
   warehouse valuations, finance-log amounts.
3. **Pair slugs** — `XAU/IRR → XAU/IRT` and every routing rule, mapping and
   `user_level` pair reference that spells the quote symbol.
4. **Code constants** — replace the literal `"IRR"` with a single exported
   `RIAL_SYMBOL_SLUG = "IRT"`; ban the bare string in lint.
5. **Verification gate** — snapshot `SUM(balance)` per symbol before and after;
   the IRT total must be exactly one tenth of the IRR total, and every other
   symbol's total must be **unchanged**. Do not proceed if it is not.
6. **Rollback** — the inverse migration multiplies by 10. Keep it working; do
   not squash this migration later.

Run it with the platform in maintenance mode. There is no safe online version of
this — a partially converted balance table is a factor-of-ten error in
production money.

### 3.2 Rial at the bank boundary

Iranian bank rails settle in **rial**. Every adapter that talks to one converts
at its own edge and nowhere else:

| Boundary | Direction | Conversion |
|---|---|---|
| Shahin (`src/shahin`) | outbound transfer, inbound statement | ×10 out, ÷10 in |
| CBP / Kaino gateways (`src/payment-bus`, `payment-callback`) | both | same |
| `shahin_entry.currency` | stored | keep `IRR` — it mirrors the bank's own record |
| OCR'd receipts | inbound | amounts read from bank slips are rial |

Everything above the adapter — wallets, orders, credits, vouchers, the whole
admin API — is IRT. Adapters carry a unit test asserting the factor in both
directions; that test is the guard rail for the entire money model.

### Dates
- API returns **ISO-8601 UTC** and, for anything the UI prints in a table, a
  precomputed Jalali twin (backend already depends on `moment-jalaali`):
  ```jsonc
  { "createdAt": "2026-07-15T09:12:00Z", "createdAtJalali": "1405/04/24" }
  ```
- API **accepts** either ISO or `YYYY/MM/DD` Jalali on input; a
  `@IsJalaliOrIso()` class-validator decorator normalises in one place. The
  date pickers (`react-multi-date-picker` + persian calendar) emit
  `YYYY/MM/DD` Jalali, so accepting it removes conversion code from 9 pages.

### Auth
`Authorization: Bearer <adminAccessToken>`, guarded by `AdminAuthGuard`.
Add refresh tokens (see §4.1) — the panel currently has no session persistence
at all, so a page reload logs the operator out.

---

## 4. Cross-cutting platform work

These land **before** page endpoints; nearly every page depends on at least one.

### 4.1 Admin auth & session — `src/admin`

Current: `POST v1/admin/auth/send-otp` (phone + password) → `verify-otp` → token.
The login screen takes **"ایمیل یا نام کاربری" + password** and the OTP screen
shows a 60s countdown with a resend affordance.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/admin/auth/login` | `{ identifier, password }` — identifier is email **or** phone **or** username. Returns `{ otpRequired: true, challengeId, maskedPhone, expiresIn: 60 }` |
| `POST` | `/v1/admin/auth/otp/verify` | `{ challengeId, code }` → `{ accessToken, refreshToken, expiresIn, admin }` |
| `POST` | `/v1/admin/auth/otp/resend` | rate-limited, 60s cooldown, returns new `expiresIn` |
| `POST` | `/v1/admin/auth/refresh` | rotate refresh token |
| `POST` | `/v1/admin/auth/logout` | revoke |
| `GET` | `/v1/admin/auth/me` | `{ id, firstName, lastName, displayName, email, phone, role, permissions[], avatarUrl }` — powers sidebar footer + `SettingsPage` |
| `POST` | `/v1/admin/auth/forgot-password` | `{ identifier }` → emails a code |
| `POST` | `/v1/admin/auth/reset-password` | `{ identifier, code, newPassword }` |

Password policy must match the client-side rule already enforced in
`Login.jsx`/`ForgotPasswordPage.jsx`: lower + upper + digit + special.

`maskedPhone` matters — the OTP screen hardcodes `۰۹۱۲•••۴۸۲۱` today.

### 4.2 RBAC — new `src/admin-role` module

Replaces the 4-value enum with data-driven roles. The permission catalog is
already written in `ui-parszargar/src/data/rolesMock.js` — **use those 22 keys
verbatim** (`dashboard`, `users_view`, `users_edit`, `kyc_view`, `kyc_approve`,
`roles_view`, `roles_manage`, `trades_view`, `trades_manage`, `wallets_view`,
`wallets_ops`, `withdrawals_view`, `withdrawals_approve`, `price_engine`,
`arbitrage`, `accounting`, `reports`, `providers`, `warehouse`, `settings`,
`api`, `monitoring`).

- `@RequirePermissions('withdrawals_approve')` decorator + guard, applied to
  every admin route.
- `GET /v1/admin/permissions` returns the catalog with Persian labels so the
  role screens stop hardcoding them.
- `me.permissions[]` drives sidebar filtering client-side.
- Seed migration maps the legacy roles: `superAdmin`→all, `admin`→all minus
  `settings`/`api`, `finance`→finance set, `warehouse`→warehouse set.

### 4.3 Operation OTP — new `src/operation-otp` module

Five pages gate a mutation behind a 60-second code: `WalletOperationsPage`,
`WithdrawalsPage` (per-row **and** bulk), `AccountingDocumentPage`,
`ShahinPage` (transfer), `WithdrawalEMPage`.

```
POST /v1/admin/operations/otp        { scope, refId?, refIds?[], payloadHash }
   → { challengeId, expiresIn: 60, maskedPhone }
```
- `scope ∈ wallet.deposit | wallet.withdraw | withdraw.approve | withdraw.reject
  | withdraw.bulk | accounting.voucher | shahin.transfer | em.approve`
- Redis-backed, TTL 60s, max 3 attempts, one live challenge per
  (admin, scope, refId).
- `payloadHash` binds the code to the exact amount/account being confirmed, so a
  code issued for 5,000,000 cannot be replayed against 500,000,000.
- Consumed by passing `{ challengeId, otp }` in the action body. Bulk actions
  take a single challenge covering `refIds[]` — this is exactly the
  `BULK_OTP_ID` behaviour in `WithdrawalsPage.jsx`.

### 4.4 Audit trail

Every admin mutation writes `{ adminId, permission, action, entity, entityId,
before, after, ip, userAgent, otpChallengeId, at }` via a global interceptor.
Non-negotiable for the money paths; it also backs `WithdrawalsPage`'s
`rejectedBy` / `rejectReason` columns and `AccountingDocumentPage`'s
`createdBy`.

### 4.5 Realtime — `src/websocket`

Socket.IO `/admin` namespace, JWT-authenticated, room-per-topic:

| Room | Payload | Consumer |
|---|---|---|
| `prices` | 16-instrument tick | `MarketTicker`, `PricePage` |
| `market-status` | open/closed | ticker banner |
| `presence` | `{ onlineUsers }` | header badge |
| `notifications` | new notification | `NotificationBell` |
| `dashboard` | activity-feed item | Dashboard live feed |
| `monitoring` | node/alert state change | Monitoring |
| `arbitrage` | robot position/profit | Arbitrage |

The 16 ticker instruments are **symbols**, not a separate mapping table
(decided). Today only five symbol rows exist — `IRT`, `USD`, `EUR`, `AED`,
`XAU` — so the work is a seed migration, not a modelling exercise:

- add `ticker_key varchar unique null`, `is_ticker boolean default false`,
  `display_order int` to `symbol`;
- seed the remaining rows and set `ticker_key` to the client's camelCase key
  (`gold18`, `usdRial`, `emamiCoin`, `gold24`, `usdToman`, `rubToman`,
  `halfEmamiCoin`, `quarterEmamiCoin`, `eurToman`, `gbpToman`, `jpyToman`,
  `cadToman`, `audToman`, `sekToman`, `nokToman`, `dkkToman`);
- the same migration seeds the ~60 `PRICE_INSTRUMENTS` rows §5.13 needs, with
  `category` (طلا/سکه/نقره/ارز/کریپتو/کالا) and `display_color`.

`ticker_key` exists so `constants/prices.js` and `data/priceInstruments.js` can
both be deleted rather than kept in sync by hand. Note the redundancy the IRT
migration creates: `usdRial` and `usdToman` are now the same number ×10 — keep
`usdRial` in the ticker only if the trading desk actually reads it in rial, and
drop it otherwise. Polling fallback: `GET /v1/admin/market/ticker` every 3s.

### 4.6 Files

MinIO is already wired (`src/minio`, `src/file`). Standardise on:
```
POST   /v1/admin/files                multipart → { fileId, url, mime, size }
GET    /v1/admin/files/:fileId        presigned redirect (short TTL)
DELETE /v1/admin/files/:fileId
```
Consumers: KYC documents, EM receipts, warehouse document attachments, withdraw
receipts (which already flow through OCR).

### 4.7 Exports

- **Excel/CSV** — server-side via `exceljs` (already a dependency):
  `GET .../export?format=xlsx|csv` returning a stream.
- **Printable documents** (EM receipt, provider settlement invoice, Shahin
  statement) — the UI *already* owns pixel-perfect print CSS
  (`RECEIPT_PRINT_CSS`, `INVOICE_PRINT_CSS`). Do **not** rebuild these as
  server-side PDFs. Ship structured JSON and let the client print. One endpoint
  each, returning the exact fields the print template consumes.

### 4.8 OpenAPI + mock server

Swagger is configured and basic-auth protected, but it currently documents
**zero response shapes** — 444 routes, 126 request DTOs, 3 response files, and
no `@ApiOkResponse({ type })` anywhere. Since the spec is meant to be the
frontend developer's primary documentation, closing that is Phase 0 work, not a
polish item. It also blocks client generation: every operation would return
`any`.

**Landed** (`src/shared/`), with the schema asserted in
`api-envelope.decorator.spec.ts` rather than assumed:

| Building block | Use |
|---|---|
| `ResponseEnvelopeDto` / `ErrorEnvelopeDto` | the real wire shapes |
| `@ApiEnvelopeResponse(Dto, { isArray? })` | single-object and array payloads |
| `@ApiPaginatedResponse(Dto)` | list endpoints |
| `@ApiEnvelopePrimitiveResponse(type)` | the escape hatch for primitives |
| `@ApiAdminErrorResponses()` | 400/401/403/404, applied once per controller |
| `PaginationQueryDto` (`page`, `pageSize`, `sort`, `order`, `skip`/`take`/`pageNumber`) | list query params |
| `PaginatedDto<T>` + `paginate(items, total, query)` | list responses |

`admin/bank-accounts` is the migrated reference: extend `PaginationQueryDto`,
keep the old param as a `deprecated: true` alias for one release, return
`paginate(...)`, decorate the controller.

Still required, in order:

1. A response DTO per endpoint, starting with the ~70 the panels already call.
2. An `@ApiEnvelope(Dto)` decorator (`ApiExtraModels` + `getSchemaPath`) that
   documents the real wire shape `{ status, message, data: Dto }` —
   `ResponseInterceptor` wraps every handler, so an inner-shape-only schema is
   wrong at the outermost level.
3. A generic `PaginatedDto<T>` so `{ items, total, page, pageSize, totalPages }`
   is declared once.
4. `@ApiOperation` on the 168 routes without one; `@ApiTags` on the 7
   controllers missing it; `@ApiQuery` for every filter in §3's search trio.
5. Realistic `example` values — a real IBAN, a real Jalali date, a real decimal
   string. For a Persian-reading frontend developer these carry more than the
   type names do.

Then publish `openapi.json` as a build artefact, generate a Prism mock from it
so the frontend can migrate off `data/*Mock.js` in parallel with backend work,
and generate the typed client described in
`ADMIN-PANEL-PARITY-PLAN.md` §7.

---

## 5. Endpoint specification, page by page

Legend — **E** = exists, **X** = extend existing, **N** = new.

### 5.1 Login / OTP / Forgot / Support  — `components/auth/*`

| | Endpoint | Notes |
|---|---|---|
| X | `POST /v1/admin/auth/login` | accepts email/username, not just phone |
| X | `POST /v1/admin/auth/otp/verify` | |
| N | `POST /v1/admin/auth/otp/resend` | |
| N | `POST /v1/admin/auth/forgot-password` · `.../reset-password` | |
| N | `POST /v1/support/contact` | public, captcha + rate limit: `{ name, email, message }` |
| N | `GET /v1/app/releases` | powers the "دانلود وب اپلیکیشن" page (version, QR target, platform links) |

### 5.2 App shell

| | Endpoint | Feeds |
|---|---|---|
| N | `GET /v1/admin/market/ticker` | `MarketTicker` — 16 instruments + direction |
| E | `GET /admin/market-status` | open/closed banner |
| E | `GET /admin/users/online` | "۱٬۲۴۸ آنلاین" badge |
| N | `GET /v1/admin/notifications/inbox?unreadOnly=true&limit=6` | bell dropdown |
| N | `GET /v1/admin/notifications/unread-count` | bell badge |
| X | `GET /v1/admin/auth/me` | sidebar identity, permission-filtered nav |

### 5.3 Dashboard

Four KPI cards act as a **global filter** (`users | volume | profit |
withdrawals`) that reshapes the chart, pie, feed, health panel and table.
One parameterised set rather than four page-specific sets:

| | Endpoint | Response |
|---|---|---|
| N | `GET /v1/admin/dashboard/kpis` | all four cards at once: totals, deltas, sub-values |
| N | `GET /v1/admin/dashboard/series?metric=&year=` | 12 Jalali months × `{ month, primary, secondary }` |
| N | `GET /v1/admin/dashboard/distribution?metric=` | 4-slice pie `{ label, percent }` |
| N | `GET /v1/admin/dashboard/activity?metric=&limit=5` | feed `{ title, description, severity, at }` |
| N | `GET /v1/admin/dashboard/health?metric=` | `{ label, percent, variant }[]` |
| N | `GET /v1/admin/dashboard/recent?metric=&limit=5` | the metric-shaped table rows |

`metric` also decides the "مشاهده همه" target, which the client already maps.

### 5.4 Monitoring

Same 4-way KPI filter (`providers | latency | rejection | alerts`).

| | Endpoint |
|---|---|
| N | `GET /v1/admin/monitoring/summary` — 4 KPIs |
| N | `GET /v1/admin/monitoring/metrics?metric=&points=20` |
| N | `GET /v1/admin/monitoring/resources?metric=` — CPU/RAM/disk/bandwidth, or per-service latency / rejection / alert counts |
| N | `GET /v1/admin/monitoring/nodes?metric=` — `{ name, location, uptime\|latencyMs\|rejectRate, status: online\|degraded }` |
| N | `GET /v1/admin/monitoring/incidents?metric=` |
| N | `POST /v1/admin/monitoring/incidents/:id/activate` · `/deactivate` |
| E | `GET /admin/monitoring/providers`, `/best-prices`, `/history` — already backs the "providers" filter |

**Source of truth: the standalone `monitor` app** (decided). It already serves
most of this page and must not be duplicated inside Nest:

| Monitor endpoint | Feeds |
|---|---|
| `GET /api/services` | the nodes table — per-service `alive`, container stats, internal/external endpoints |
| `GET /api/system` | the resources panel — CPU load, memory %, disk %, network |
| `GET /api/system/history` | the 20-point chart (60 in-memory points today) |
| `GET /api/containers/stats` · `/api/logs/:container` | drill-down |

Split of responsibilities:

- **`monitor` collects.** Backend never probes hosts or shells out to Docker.
- **Backend serves and remembers.** `AdminMonitoringController` gets an upstream
  HTTP client with a Redis cache (5–10s TTL) and a circuit breaker: if `monitor`
  is down the admin page shows the last known snapshot with `"stale": true` and
  a timestamp — a monitoring outage must never 500 the panel that exists to
  report outages.
- **Infra vs application metrics are different sources.** `monitor` cannot see
  an application-level reject; the "میزان رد شده" figures (KYC 0.24%, Auth
  0.05%) come from the backend's own per-endpoint metrics (§8), not from
  `monitor`. Same for provider latency, which `admin-monitoring` already has.
- **Incidents live in backend Postgres**, not in `monitor`. They carry admin
  actions (activate/deactivate), need audit rows and must survive a `monitor`
  restart. `monitor` publishes state transitions; the backend opens, dedupes and
  closes incident records from them.

Four changes to `monitor` itself, all small and all best practice:

1. **Authenticate.** It currently serves container stats and log tails to
   anything that can reach port 8080. Shared-secret header between backend and
   monitor, and it never faces the internet.
2. **Persist history.** In-memory `sysHistory` (60 points, `MAX_HISTORY`) is
   lost on restart and wrong the moment there are two replicas. Write to Redis
   with a TTL, or expose `/metrics` in Prometheus exposition format and let a
   scraper own retention — the second option costs less later.
3. **Version the contract.** Freeze the response shapes under `/api/v1/*` before
   the backend depends on them.
4. **Add `location`.** The UI shows تهران / فرانکفورت / آمستردام per node;
   nothing in `services[]` carries it today. A static field per service entry is
   enough.

### 5.5 Users

| | Endpoint | Detail |
|---|---|---|
| X | `GET /v1/admin/users` | `?q=&searchBy=name\|wallet\|phone\|status&status=&level=&userType=&minBalance=&maxBalance=&page=&pageSize=` — replaces `pageNumber`/`pageSize`/`searchKey` |
| N | `GET /v1/admin/users/stats` | `{ all, active, vip, blocked }` + deltas for the 4 KPIs |
| E | `GET /v1/admin/users/:id` | |
| N | `GET /v1/admin/users/:id/wallets` | the "مشاهده کیف‌ها" modal: `[{ id, type, balance, unit }]` |
| N | `POST /v1/admin/users` | `UserCreatePage` body: `first_name, last_name, mobile, national_code, password, email, birth_date, register_date, role, user_types[]`. **Keep snake_case** — the page already builds it. `role ∈ user\|admin`; `user_types ⊂ bronze\|silver\|vip\|official\|unofficial` and must be empty when role is admin |
| N | `PATCH /v1/admin/users/:id` | |
| E | `PATCH /v1/admin/users/:id/activation` · `/role` | |
| N | `GET /v1/admin/users/lookup?q=` | shared autocomplete for Partner-create, Accounting-voucher, Warehouse-document customer pickers |

Row shape the table needs: `{ id, fullName, email, phone, level, userType,
totalBalance, walletCount, joinedAt(+Jalali), status }`. `totalBalance` is a
cross-wallet sum in the display currency — compute in SQL, not per-row.

### 5.6 KYC

| | Endpoint | Detail |
|---|---|---|
| X | `GET /v1/admin/kyc` | `?status=pending\|approved\|rejected\|provider\|all&searchBy=name\|nationalCode\|phone\|status&q=&joinFrom=&joinTo=&page=&pageSize=12` — consolidates today's `admin/pending` + `admin/all` |
| E | `GET /v1/admin/kyc/stats` | 5 KPI counts + average processing hours ("۲٫۴ ساعت") |
| N | `GET /v1/admin/kyc/:id` | full detail: firstName, lastName, nationalCode, birthDate, joinedAt, membershipType, fatherName, phone, address, postalCode, email, docType, submittedAt |
| X | `POST /v1/admin/kyc/:id/approve` · `/reject` | reject takes `{ reason }`; keep `reject-multiple` |
| E | `GET /v1/admin/kyc/:id/documents` | `[{ id, title, url, fileName, mime }]` |
| N | `POST /v1/admin/kyc/:id/documents` | multipart `{ title, file }` — the "افزودن تصویر" modal |
| N | `DELETE /v1/admin/kyc/:id/documents/:docId` | |
| E | `GET /v1/admin/kyc/documents/:docId/download` | presigned |

`provider` is a **fourth KYC status** (پروایدر احراز هویت) the backend enum does
not have yet — add it, don't fake it with a flag.

### 5.7 Roles — new `src/admin-role`

| | Endpoint |
|---|---|
| N | `GET /v1/admin/roles` — `{ id, roleName, wallets[], fee, dailyWithdrawal, roleType, memberCount, hasCredit, creditAmount, isFixed }` |
| N | `GET /v1/admin/roles/stats` — `{ total, totalMembers, fixed, empty }` |
| N | `POST /v1/admin/roles` · `PATCH /:id` · `DELETE /:id` (`isFixed` roles reject delete) |
| N | `GET /v1/admin/roles/:id` — includes `configs{}` and `pairs[]` |
| N | `GET /v1/admin/permissions` — 22-key catalog with Persian labels |
| N | `GET /v1/admin/roles/:id/permissions` · `PUT` |
| N | `GET /v1/admin/roles/:id/members` |

Create/edit body (from `RoleCreatePage.handleConfirmSubmit`):
```jsonc
{
  "role_name": "مدیر مالی",
  "max_credit": "10000000",
  "wallets": ["crypto", "fiat", "metal", "rial"],
  "configs": {
    "crypto": { "buyFee": "0.125", "sellFee": "0.150", "withdrawal": "50000000",
                "hasCredit": "yes", "creditAmount": "5000000", "roleType": "official" }
  },
  "pairs": ["crypto-fiat", "fiat-metal"]
}
```
Validation: fee ≤ 3 decimals; `credit_amount` ≤ 10,000,000 (`MAX_CREDIT_AMOUNT`)
and required when `hasCredit == "yes"`; pair ids are the sorted
`"<walletA>-<walletB>"` form and must be a subset of the selected wallets.

**Fixed roles** (`isFixed`, the ones migrated from the `AdminRole` enum) —
the rule is *identity is frozen, configuration is not*:

| | Fixed role | Custom role |
|---|---|---|
| Delete | ✗ | ✓ (blocked while `memberCount > 0`) |
| Rename / change `roleType` | ✗ — code paths key off the slug | ✓ |
| Wallet config: fees, daily withdrawal, credit, pairs | ✓ | ✓ |
| Permission set | ✓, except the root role | ✓ |

The root role (`superAdmin`) permanently holds all 22 permissions and cannot be
edited at all — that is the lock-out guard, and it is also what makes the
"super admin sees everything" rule in §5.23 expressible.

Three invariants the service enforces on **every** role write, fixed or not:

1. You cannot remove `roles_manage` from your own role.
2. You cannot grant a permission your own role lacks (no escalation by proxy).
3. At least one active, unsuspended admin must retain `roles_manage`.

Each role in the list and detail responses carries what the server will actually
allow, so the client greys out the right buttons instead of reimplementing these
rules:

```jsonc
"capabilities": { "canDelete": false, "canRename": false,
                  "canEditPermissions": true, "canEditConfig": true }
```
`RolesPage` already renders a "ثابت" badge and hides delete for `isFixed` — it
should switch to driving both off `capabilities`.

### 5.8 Trades

| | Endpoint |
|---|---|
| N | `GET /v1/admin/trades/stats?assetType=` — today volume, avg execution seconds, live price, success rate |
| N | `GET /v1/admin/trades/series?granularity=month\|day&year=&month=&assetType=` — `{ bucket, buy, sell }`, Jalali-aware month lengths (leap Esfand!) |
| X | `GET /v1/admin/trades?year=&month=&day=&assetType=&page=` — `{ id, user, side, currency, weightGram, amount, status }`, wraps `admin/orders` |

`assetType ∈ all|material|crypto|fiat|rial`. Row ids link to §5.19 textId detail,
so the trade id **is** the textId — keep them identical.

### 5.9 Wallets overview

| | Endpoint |
|---|---|
| N | `GET /v1/admin/wallets/overview` — total rial balance, total gold held (kg), + per-type cards for fiat/metal/rial/crypto |
| N | `GET /v1/admin/wallets/composition?scope=all\|rial\|gold` — 4-slice pie |
| N | `GET /v1/admin/wallets/operations/recent?scope=&limit=5` — `{ user, type: واریز\|برداشت\|تبدیل, amount, unit, at }` |

### 5.10 Wallet details

| | Endpoint |
|---|---|
| X | `GET /v1/admin/wallets?type=fiat\|metal\|rial\|crypto&searchBy=name\|id\|phone\|subtype\|status&q=&status=&minBalance=&maxBalance=&page=` |

Row: `{ id, user, phone, subtype, balance, unit, marketType(formal/informal),
status, updatedAt }`. `subtype` is the symbol (طلای آبشده / سکه / USDT / دلار /
ریال رسمی…) — it comes straight off `admin-symbol`.

### 5.11 Wallet operations

| | Endpoint |
|---|---|
| N | `GET /v1/admin/wallets/operations/accounts?searchBy=name\|phone\|nationalId\|email\|formal\|walletType&q=&walletType=&formal=&minBalance=&maxBalance=&page=&pageSize=6` |
| N | `POST /v1/admin/operations/otp` `{ scope: "wallet.deposit", refId: walletId, payloadHash }` |
| N | `POST /v1/admin/wallets/:walletId/operations` |

Body:
```jsonc
{ "type": "deposit" | "withdraw",
  "bucket": "available" | "credit" | "frozen",
  "amount": "5000000",
  "challengeId": "...", "otp": "123456", "description": "..." }
```
Maps onto `WalletEntity.availableBalance / creditBalance / frozenFreeBalance`.
Must be transactional, must clamp at zero (the UI already does
`Math.max(0, …)`), must emit a `TransactionEntity` with
`ADMIN_ADJUSTMENT` and **must create the matching accounting voucher** — the page
redirects to Accounting on success precisely because the operator expects to see
the document there.

### 5.12 Credit

| | Endpoint |
|---|---|
| E | `GET /v1/admin/credits/stats` — map to the 4 KPIs: consuming, allocated, loss, profit |
| N | `GET /v1/admin/credits/series?metric=&granularity=month\|day\|hour&year=&month=&day=` |
| X | `GET /v1/admin/credits?q=&type=&minAmount=&maxAmount=&year=&month=&day=&hour=&page=` — row: `{ id, userName, type(خرید/فروش), currency, amount, date, settleDurationDays, settleUsedDays }` |
| E | `GET /v1/admin/credits/export` |

The lifecycle endpoints (`settle`, `liquidate`, `suspend`, `extend`,
`adjust-limit`, the 14-step settlement workflow) already exist and exceed what
the current UI exposes — flag for a future Credit detail screen rather than
building UI-first.

### 5.13 Price engine

| | Endpoint |
|---|---|
| N | `GET /v1/admin/price/instruments` — grouped by category (طلا/سکه/نقره/ارز/کریپتو/کالا): `{ id, name, category, buy, sell, color, marketOpen }`. 60+ instruments seeded from `data/priceInstruments.js` into `admin-symbol` |
| N | `GET /v1/admin/price/history?symbols=a,b,c&points=30` — `{ i, "<id>_buy", "<id>_sell" }[]`, exactly the `buildChartData` shape |
| N | `PATCH /v1/admin/price/instruments/:id/market-status` `{ open: bool }` — the per-symbol open/close toggle behind a confirm |
| N | `GET /v1/admin/price/engine-config` · `PATCH` — `{ sources: { tgju, brsapi }, autoSpread, refreshIntervalSec }` |
| E | `admin/symbols`, `admin/pair`, `admin/monitoring/best-prices` | underlying data |

### 5.14 Arbitrage

| | Endpoint |
|---|---|
| N | `GET /v1/admin/arbitrage/robots` — `{ id, name, category, pair, profit, latencyMs, active }` |
| N | `POST /v1/admin/arbitrage/robots` · `PATCH /:id` · `DELETE /:id` |
| N | `POST /v1/admin/arbitrage/robots/:id/toggle` `{ active }` (confirm-gated) |
| N | `GET /v1/admin/arbitrage/stats` — today profit, today trades, success rate, avg latency |
| N | `GET /v1/admin/arbitrage/series?metric=&granularity=month\|day\|hour&…` |
| N | `GET /v1/admin/arbitrage/positions?…&page=` |
| N | `GET /v1/admin/arbitrage/providers?category=` — the provider multi-select |
| E | `GET /admin/arbitrage/opportunities`, `/alerts`, `/config`, `POST /scan` |

Robot body: `{ name, category(کریپتو|متریال|فیات|ریال), types[](official|unofficial),
pair, providerIds[], profit, lowProfit, targetProfit, loss, latencyMs,
notifyNumber, notifyEnabled }`. Valid pairs are constrained by category —
serve `PAIRS_BY_CATEGORY` from `GET /v1/admin/arbitrage/pairs?category=` instead
of duplicating the table in the client.

### 5.15 Withdrawals

| | Endpoint |
|---|---|
| X | `GET /v1/admin/withdraw?assetType=all\|crypto\|material\|rial&status=pending\|queue\|paid\|rejected\|all&searchBy=name\|owner\|iban\|range&q=&minAmount=&maxAmount=&page=&pageSize=6` |
| N | `GET /v1/admin/withdraw/stats` — per asset `{ count, amount }` **and** per status counts (the UI shows both axes) |
| N | `POST /v1/admin/operations/otp` `{ scope:"withdraw.approve", refId }` — replaces the placeholder `POST /api/withdrawals/{id}/request-code` |
| N | `POST /v1/admin/withdraw/actions` — bulk, replaces `POST /api/withdrawals/action` |

```jsonc
{ "action": "approve" | "reject",
  "challengeId": "...", "otp": "123456",
  "reason": "مغایرت اطلاعات حساب",
  "items": [ { "id": "WD1000", "trackingCode": "870013" } ] }
```
Rule from the UI: rows in `queue` (در انتظار تایید دستی) are settled with a
**bank tracking code** instead of an OTP; rows in `pending` need the OTP. Enforce
that server-side. Row must carry `accountOwner` and an `ownerKind` of
`self | other | company` — the panel highlights third-party IBANs.

### 5.16 Shahin (bank rails) — mostly exists

| | Endpoint |
|---|---|
| E | `GET /api/shahin/accounts` · `/:id` — bank, owner, IBAN, accountNumber, balance, blocked, dailyLimit |
| E | `POST /api/shahin/account/balance` → make it `GET /v1/admin/shahin/accounts/:id/balance` |
| E | `POST /api/shahin/account/statement` → `GET /v1/admin/shahin/accounts/:id/statement?from=&to=&minAmount=&maxAmount=&trackNo=&page=` |
| N | `POST /v1/admin/shahin/accounts/inquiry` `{ destAccount }` → `{ ownerName, accountNumber, bankName }` — the "استعلام" step |
| N | `POST /v1/admin/operations/otp` `{ scope:"shahin.transfer" }` |
| E | `POST /api/shahin/transfer` | add `{ method: satna\|paya\|pol\|account, challengeId, otp }` |
| E | `POST /api/shahin/batch-transfer` | |
| N | `GET /v1/admin/shahin/statement/export?accountIds=&from=&to=` | the date-range download |
| N | `GET /v1/admin/shahin/open-banking` · `POST /:id/sync` — connection status, access scope, consent expiry, last sync |

### 5.17 Withdrawal EM — a read model over `src/p2p`, not a new module

**Confirmed: EM is the existing rial P2P settlement desk.** §5.17 therefore
collapses from a new module (~3 weeks) to an adapter + projection (~1 week). No
new lifecycle, no second source of truth for money — `P2pSettlementService`
stays the only place balance moves.

The mapping is close to exact:

| EM screen concept | `src/p2p` |
|---|---|
| Request row | `p2p_withdraw_request` (1:1 with `withdraw`) |
| نوع درخواست = برداشت | a `p2p_withdraw_request` |
| نوع درخواست = واریز | a `p2p_deposit_intent` |
| نوع درخواست = تسویه | a match with `source = ADMIN` (company settlement) |
| نوع درخواست = انتقال | an `admin_bank_account` transfer leg |
| فیش (N per request) | `p2p_payment_proof`, one per `p2p_match`; a request fans out to N parts → N matches → N proofs, which is exactly the stacked date/time/upload cells in the EM table |
| کاربر درخواست‌کننده | the withdrawer on the request |
| کاربر انجام‌دهنده | the depositor on the match; the acting admin when `source = ADMIN` |
| حساب مقصد | the withdrawer's IBAN on the request |
| «حساب داده شده» | the `admin_bank_account` assigned for admin settlement |
| زمان مانده تا انقضا | `p2p_withdraw_part.reserved_until` (or request expiry) |
| تأیید / رد | the existing escalation resolutions `CONFIRM_PAYMENT` / `REJECT_PAYMENT` / `SETTLE_FROM_ADMIN` |

The four EM statuses are a **projection** of the existing state machines, not new
columns:

| EM status | Derived from |
|---|---|
| در انتظار دریافت حساب | `PENDING_MATCHING`, or `ADMIN_SETTLEMENT` before an account is assigned |
| در انتظار دریافت فیش | part `RESERVED` / match `AWAITING_PAYMENT` |
| فیش پرداخت‌شده | match `PROOF_SUBMITTED` / `CONFIRMED` |
| رد شده | `REJECTED_BY_WITHDRAWER`, or an escalation resolved as reject |

Put the projection in one place — a `P2pEmViewService` — so the mapping table
above exists as code, not as a `CASE` expression copy-pasted across handlers.

| | Endpoint |
|---|---|
| N | `GET /v1/admin/em/requests?status=&searchBy=requester\|performer\|account&q=&page=&pageSize=10` — union view over withdraw requests + deposit intents |
| N | `GET /v1/admin/em/stats` — the 5 KPIs, counted off the projection |
| N | `GET /v1/admin/em/requests/:id` — request + parts + matches + proofs |
| X | `POST /v1/admin/em/requests/:id/account` → assigns an `admin_bank_account` (existing `AdminBankAccountService`) |
| X | `POST /v1/admin/em/requests/:id/receipts` → wraps `p2p_payment_proof` upload |
| N | `GET /v1/admin/em/receipts/:id` — printable payload for `ReceiptModal` |
| X | `POST /v1/admin/em/requests/:id/approve` · `/reject` → `P2pEscalationService` resolutions, OTP-gated per §4.3 |
| E | `GET /v1/admin/em/providers` → `admin/provider-finance/overview`, which already returns the بدهکار/بستانکار position per counterparty |

Two residual items the P2P model does not answer:

- **`hasLef` (دارای لف).** Nothing in `src/p2p` corresponds. Modelled as an
  explicit `has_enclosure boolean` on the request, set by the operator — the UI
  only ever displays بله/خیر. Worth 30 seconds of confirmation from whoever
  specified the column.
- **Expiry rendering.** Serve `expiresAt` as a timestamp. The EM mock ships
  pre-rendered strings ("۳ ساعت"); those go stale in an open browser tab, and
  the countdown belongs on the client.

Because this is a projection, the admin actions must go through the P2P services
rather than writing `p2p_*` tables directly — that is what keeps the escalation
audit log, the two-person control in `RIAL-P2P-SETTLEMENT-PLAN.md` §8.3, and the
settlement invariants intact.

### 5.18 Provider settlement document

| | Endpoint |
|---|---|
| X | `GET /v1/admin/provider-finance/settlement?from=&to=&currency=&page=` → `{ debtors: [], creditors: [] }`, rows `{ date, time, name, currency, amount, type }` |
| E | `GET /admin/provider-finance/overview` · `POST /settle` · `GET /settlements` |
| N | `GET /v1/admin/provider-finance/settlement/print` — JSON for the existing client-side A4 invoice template |

### 5.19 TextId

| | Endpoint |
|---|---|
| N | `GET /v1/admin/text-ids?q=&type=خرید\|فروش\|واریز\|برداشت&from=&to=&minAmount=&maxAmount=&page=` |
| N | `GET /v1/admin/text-ids/:id` |
| N | `GET /v1/admin/text-ids/:id/document` — the per-row download |

Same identifier space as trades (§5.8) and warehouse crypto documents
(`textId` column) — one lookup table, three consumers.

### 5.20 Warehouse

**Overview** (`WarehousePage`)

| | Endpoint |
|---|---|
| N | `GET /v1/admin/warehouse/stats?type=material\|crypto\|rial\|fiat` — 6 KPIs, each `{ weight, count }` with `weightUnit`/`countUnit` |
| N | `GET /v1/admin/warehouse/inventory?type=&kpi=` |
| N | `GET /v1/admin/warehouse/capacity?type=` — `{ name, usedPercent }` |
| E | `GET /admin/warehouse/packets?status=` — the "بسته‌های در حال پردازش" table. **Confirmed: the UI's بسته is the backend's `PacketEntity`** — reuse it, do not model a second package concept. `POST /admin/warehouse/packets`, `/packets/:id/split` and `/packets/:id/picture` already exist and are richer than the current screen; the split and picture actions are worth surfacing in the UI later |
| E | `POST /admin/warehouse/create` — `{ kind, name, address, nominal_capacity }` (snake_case per `WarehouseCreatePage`) |

**Documents** (`WarehouseDocumentPage`)

| | Endpoint |
|---|---|
| N | `POST /v1/admin/warehouse/documents` |
| N | `GET /v1/admin/warehouse/documents?type=all\|crypto\|fiat\|rial\|material&page=` |
| N | `POST /v1/admin/warehouse/documents/:id/attachments` · `DELETE /:attachmentId` |
| N | `GET /v1/admin/warehouse/names?q=` — warehouse-name autocomplete |

Document body is **discriminated by warehouse type** — validate per branch:
```jsonc
{ "warehouseType": "material",           // + direction, warehouseName, amount,
  "direction": "in",                     //   customerId, date, description
  "purity": "750", "angNumber": "A-102",             // material only
  "cryptoType": "USDT", "network": "TRC20", "textId": "TX-9876",  // crypto only
  "fiatType": "دلار آمریکا", "sorter": "done" }                    // fiat only
```

**Search** (`WarehouseSearchPage`)

| | Endpoint |
|---|---|
| N | `GET /v1/admin/warehouse/search?warehouseName=&customerName=&weight=&priceFrom=&priceTo=&type=&direction=in\|out\|transfer&dateFrom=&dateTo=&purity=&angNumber=&page=` |

Result row: `{ warehouseName, customerName, symbol, type, direction, weight,
unit, value, fee, txHash, status: completed|pending|failed, date }`.

### 5.21 Accounting

| | Endpoint |
|---|---|
| X | `GET /v1/admin/accounting/stats` — income, expense, net profit, margin (`admin/financial/summary`) |
| N | `GET /v1/admin/accounting/series?metric=income\|expense\|profit\|margin&granularity=month\|day\|hour&year=&month=&day=` |
| X | `GET /v1/admin/accounting/ledger?q=&minAmount=&maxAmount=&year=&month=&day=&hour=&page=` — `{ id, description, type, amount, date }` |
| N | `GET /v1/admin/accounting/ledger/export?format=xlsx` |

### 5.22 Accounting documents (vouchers) — new

| | Endpoint |
|---|---|
| N | `GET /v1/admin/accounting/vouchers?customer=&customerType=formal\|informal\|all&amountFrom=&amountTo=&dateFrom=&dateTo=&page=` |
| N | `POST /v1/admin/accounting/vouchers` |
| N | `GET /v1/admin/accounting/vouchers/:id` |
| N | `POST /v1/admin/accounting/vouchers/:id/finalize` · `/reject` |
| N | `GET /v1/admin/accounting/catalogs` — categories (کارمزد، تسویه مشتری، اصلاح حساب، ثبت واریز، ثبت برداشت، هزینه عملیاتی), wallet options, wallet subsets (نقد/اعتبار/فریز) |
| N | `GET /v1/admin/accounting/vouchers/export` |

Create body:
```jsonc
{ "movement": "withdraw" | "deposit",
  "customerId": "...", "customerType": "formal",
  "category": "کارمزد", "wallet": "کیف پول ریالی", "walletSubset": "نقد",
  "amount": "245000000", "currency": "IRT",
  "description": "...", "date": "1405/05/12",
  "challengeId": "...", "otp": "123456" }
```
Row shape: `{ voucherId, customerName, detail, extraDesc, customerType,
currency, amount, side: بدهکار|بستانکار, status: پیش‌نویس|در انتظار تایید|ثبت نهایی,
createdBy, date }`. `side` is derived from `movement`, never client-supplied.

### 5.23 Reports

| | Endpoint |
|---|---|
| N | `GET /v1/admin/reports/stats` — generated, active schedules, downloads this month, avg generation minutes |
| N | `GET /v1/admin/reports?kpi=generated\|schedules\|downloads\|duration&from=&to=` |
| N | `POST /v1/admin/reports/generate` `{ type: معاملات\|کاربران\|مالی\|برداشت‌ها\|آربیتراژ, format: PDF\|Excel\|CSV, from, to }` → async job |
| N | `GET /v1/admin/reports/:id` — job status |
| N | `GET /v1/admin/reports/:id/download` |
| N | `GET/POST/PATCH/DELETE /v1/admin/reports/schedules` |

Generation runs on the existing `@nestjs/schedule` + RabbitMQ workers; the HTTP
call must not block.

**Visibility (decided): super admin sees everything, everyone else sees only
their own.** `report_job.created_by` and `report_schedule.owner_id` are the
filter; the root role bypasses it. Enforced identically on list, detail and
download — a report id must not be a way to read another desk's export by
guessing a UUID, so `/:id/download` re-checks ownership and returns 404 (not
403) to a non-owner, which avoids confirming that the id exists.

This deliberately does **not** add a 23rd permission key: the UI's matrix is
fixed at the 22 keys in `rolesMock.js`, so "may see all reports" is a capability
of the root role rather than a catalog entry. If a future finance-lead role
needs it without full super-admin rights, that is the moment to add
`reports_view_all` to the catalog — not before.

Retention: generated artefacts expire after **90 days**, purged from MinIO by a
nightly job; the `report_job` row survives as an audit record with
`artifactExpired: true`. Downloads are short-TTL presigned URLs and every one
writes an audit row (§4.4) — exports are the easiest bulk-exfiltration path in
the panel.

### 5.24 API management — new

| | Endpoint |
|---|---|
| N | `GET /v1/admin/api-keys` — `{ id, name, maskedKey, monthlyRequests, status: active\|limited\|revoked, createdAt }` |
| N | `POST /v1/admin/api-keys` — returns the **plaintext key exactly once** |
| N | `PATCH /v1/admin/api-keys/:id/status` · `DELETE /:id` |
| N | `GET /v1/admin/api/stats` — requests today, avg response ms, success %, error % |
| N | `GET /v1/admin/api/traffic?window=24h&bucket=1h` — 24-point series |

Store keys hashed (bcryptjs is already a dependency). "Copy" in the UI can only
copy the masked value after creation — call that out in the UI ticket.

### 5.25 Notifications (admin inbox)

| | Endpoint |
|---|---|
| N | `GET /v1/admin/notifications/inbox?unreadOnly=&page=` |
| N | `GET /v1/admin/notifications/unread-count` |
| N | `PATCH /v1/admin/notifications/:id/read` · `PATCH /read-all` |
| N | `GET /v1/admin/notifications/stats` — unread, urgent, today, realtime-enabled |
| E | `POST /admin/notifications/send`, `/send-to-segment`, templates CRUD |

Categories match the UI's icon/colour map: `withdrawal`, `kyc`, `arbitrage`,
`system`, `user`, `deposit`.

### 5.26 Settings

| | Endpoint |
|---|---|
| N | `GET /v1/admin/settings/profile` · `PATCH` |
| N | `GET /v1/admin/settings/security` · `PATCH` — `{ twoFactor, biometric, unknownLoginAlert }` |
| N | `GET /v1/admin/settings/notifications` · `PATCH` — `{ tradeAlerts, dailyEmailReport, systemAlerts }` |
| N | `GET /v1/admin/settings/platform` · `PATCH` — `{ currency, language, timezone, calendar, minWithdrawal, defaultProfitPercent }` |

Platform settings are global and must be `settings` permission-gated; the other
three are per-admin.

### 5.27 Currently-stubbed pages

`DefaultsPage`, `SupportPage`, `MarketingPage`, `CustomerOverviewPage` all render
"این صفحه در حال توسعه است". Backend capability mostly exists already — define
the contract now, build the UI later:

| Page | Endpoint | Status |
|---|---|---|
| Defaults | `GET/PATCH /v1/admin/defaults` — typed key/value registry | N |
| Support | `GET /admin/crm/tickets`, `/tickets/:id`, `PATCH /:id/assign`, `/:id/status`, `POST /:id/messages` | **E** |
| Marketing | `admin/discounts/coupons`, `/promotions`, `admin/crm/segments` | **E** |
| Customer overview | `GET /admin/crm/users/:userId/360` | **E** |

---

## 6. Data model additions

| Entity | Purpose |
|---|---|
| `admin_role` | id, name, isFixed, roleType, maxCredit, memberCount |
| `admin_role_permission` | roleId, permissionKey |
| `admin_role_wallet_config` | roleId, walletType, buyFee, sellFee, dailyWithdrawal, hasCredit, creditAmount, roleType |
| `admin_role_pair` | roleId, pairKey |
| `admin_refresh_token` | rotation + revocation |
| `admin_audit_log` | §4.4 |
| `operation_otp_challenge` | Redis primary + Postgres archive for audit |
| `accounting_voucher` | §5.22, double-entry with `side` |
| `accounting_voucher_line` | ledger lines |
| *(none for EM)* | §5.17 is a projection over the existing `p2p_*` tables; the only new column is `p2p_withdraw_request.has_enclosure` |
| `service_provider` | infra provider registry, 13 categories (§5.28 / `ProvidersPage`) |
| `api_key` | hashed secret, status, usage counters |
| `report_job` / `report_schedule` | §5.23 |
| `platform_setting` / `admin_setting` | §5.26 |
| `monitoring_node` / `monitoring_incident` | §5.4 |
| `warehouse_document` / `warehouse_document_attachment` | §5.20 |
| `arbitrage_robot` / `arbitrage_position` | §5.14 |

| `report_job` retention | `created_by`, `artifact_expires_at`, `artifact_expired` (§5.23) |

Existing entities to extend: `AdminEntity` (`roleId` FK, `firstName`,
`lastName`, `username`, `avatarUrl`), `UserKycEntity` (`provider` status),
`ProviderEntity` (`category`, `kind`, `reliability`, `supply`, `basePrice`),
`SymbolEntity` (`marketOpen`, `displayColor`, `tickerKey`, `isTicker`,
`displayOrder`, `category`), `P2pWithdrawRequestEntity` (`hasEnclosure`).

Migrations, in order, all in Phase 0:

1. `symbol`: `IRR → IRT` rename + the ticker/instrument columns (§3.1, §4.5).
2. The ÷10 balance conversion (§3.1) — separate migration, separate
   verification gate, separately reversible.
3. Seed the ~60 price instruments and the 16 ticker keys.
4. `admin_role` + permission tables, seeded from the legacy `AdminRole` enum
   with the four roles marked `isFixed`.

Every change ships as a TypeORM migration under `src/migrations` — the project
does not use `synchronize`.

---

## 7. Delivery phases

Sequenced so the frontend can cut over page-by-page. Sizing assumes two backend
engineers plus one frontend engineer doing the mock→API swap in parallel.

| Phase | Scope | Unblocks | Est. |
|---|---|---|---|
| **0 — Foundation** | **the IRR→IRT migration (§3.1) and the bank-boundary adapters (§3.2)**, symbol/ticker seed (§4.5), conventions, versioning of existing admin routes, pagination DTO, `admin-role` + permission guard, operation-OTP module, audit interceptor, refresh tokens, Jalali validator/serializer, Swagger + Prism mock | everything | 2–3 wks |
| **1 — Auth & shell** | §5.1, §5.2, notifications inbox, presence, ticker + WS `prices` | operator can log in and stay logged in | 1 wk |
| **2 — Identity** | Users (§5.5), KYC (§5.6), Roles (§5.7) | the 3 highest-traffic pages | 2 wks |
| **3 — Money core** | Wallets ×3 (§5.9–5.11), Credit (§5.12) | wallet operations, the first OTP-gated writes | 2 wks |
| **4 — Withdrawals** | Withdrawals (§5.15), Shahin (§5.16), EM projection over `p2p` (§5.17), provider settlement (§5.18) | the whole payout desk | 2 wks |
| **5 — Market** | Trades (§5.8), Price engine (§5.13), Arbitrage (§5.14) | trading ops | 2 wks |
| **6 — Warehouse** | §5.20 ×3 | physical inventory | 2 wks |
| **7 — Finance docs** | Accounting (§5.21), vouchers (§5.22), textId (§5.19), Reports (§5.23) | month-end close | 2 wks |
| **8 — Platform** | Dashboard (§5.3), Monitoring (§5.4), Providers registry, Partners, API keys (§5.24), Settings (§5.26) | | 2 wks |
| **9 — Deferred pages** | Defaults, Support, Marketing, Customer overview (§5.27) | | 1 wk |

~180 endpoints, of which roughly 70 already exist in some form. The seven
answered questions moved about a week net: EM shed ~2 weeks by becoming a
projection, Phase 0 gained ~1 week for the IRT migration.

**Phase 0 is now a hard gate.** Nothing else can start against a database whose
rial balances are mid-conversion, and no endpoint should be written against the
`IRR` symbol only to be rewritten. If the IRT migration slips, the whole plan
slips — that is the correct dependency, not a scheduling accident.

### Parallel frontend workstream

1. `src/api/client.js` — fetch wrapper: base URL, bearer token, `Accept-Language: fa`,
   envelope unwrapping, error → `react-toastify`, 401 → refresh → retry once.
2. `src/api/<domain>.js` per §5 section.
3. Replace `src/data/*Mock.js` and the inline `buildMock*`/`seededRnd`
   generators page by page. The mock modules already expose store-like APIs
   (`getKycList`/`setKycList`, `getRolesList`, `getRobotsList`) so most pages
   change only at the module boundary.
4. Add a data-fetching layer with caching/invalidation (TanStack Query is the
   obvious fit and is not yet a dependency).
5. Persist the session (the app currently holds `screen` state in memory — a
   refresh drops the operator back to the login screen).

---

## 8. Non-functional requirements

- **Authorisation on every route.** No admin endpoint ships without an explicit
  `@RequirePermissions(...)`; a missing decorator must fail CI.
- **Idempotency.** All OTP-gated money mutations accept `Idempotency-Key`;
  replays return the original result rather than double-moving funds.
- **Rate limits.** OTP request/verify, login, forgot-password, support contact.
- **Concurrency.** Wallet mutations use `SELECT … FOR UPDATE` or the existing
  optimistic `@VersionColumn` pattern (as in `P2pWithdrawPartEntity`).
- **Query budget.** List endpoints must be single-query with SQL aggregation —
  `UsersPage` sums balances across N wallets per row and `Withdrawals` computes
  per-asset totals; both are trivial to turn into N+1 disasters.
- **Tests.** Unit tests for money math and OTP binding; e2e per controller;
  contract tests generated from the OpenAPI spec so client and server cannot
  drift.
- **Observability.** Existing Winston + Filebeat; add per-endpoint latency
  metrics so §5.24's API stats and §5.4's monitoring have a real source.

---

## 9. Decision log

All seven questions from the first draft are answered. Recorded here because
each one is load-bearing somewhere in §3–§7.

| # | Question | Decision | Consequence |
|---|---|---|---|
| 1 | IRR or IRT on the wire | **IRT**, and the `IRR` symbol row is replaced rather than converted at the edge | §3.1 migration; §3.2 rial only at bank adapters; Phase 0 grows ~1 wk and becomes a hard gate |
| 2 | Is EM the P2P rial desk | **Same desk** | §5.17 becomes a projection over `p2p_*`; Phase 4 drops ~2 wks; no new money path |
| 3 | Ticker keys | **Symbols**, no mapping table | §4.5 seed migration adds `ticker_key`/`is_ticker`; only 5 symbol rows exist today |
| 4 | Packages vs `PacketEntity` | **Same concept** | §5.20 reuses the existing packet endpoints |
| 5 | Fixed roles — editable? | *Our call:* identity frozen, configuration editable, permissions editable except the root role | §5.7 table + 3 escalation invariants + `capabilities` on the payload |
| 6 | Monitoring source of truth | **The standalone `monitor` app** | §5.4 backend caches and projects; 4 hardening items on `monitor`; app-level metrics stay in backend |
| 7 | Report visibility | **Super admin sees all, others see their own** | §5.23 ownership filter, 404 not 403, 90-day retention, no 23rd permission key |

### Still open

Small, and none of them block Phase 0:

1. **`hasLef` (دارای لف)** — no counterpart in the P2P model. Specced as an
   operator-set boolean (§5.17); confirm with whoever specified the column.
2. **`usdRial` in the ticker** — after the IRT migration it is `usdToman` × 10.
   Keep only if the desk genuinely reads rial (§4.5).
3. **Shahin `IRR` in stored entries** — §3.2 keeps `shahin_entry.currency` as
   `IRR` because it mirrors the bank's record. Confirm that finance wants the
   bank's unit preserved there rather than normalised.
4. **`monitor` history retention** — Redis with a TTL, or Prometheus exposition
   plus a scraper. The second costs less past ~3 months; pick before §5.4 is
   built, not during.
