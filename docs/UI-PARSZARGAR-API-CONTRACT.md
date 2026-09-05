# API contract — page → endpoint index

Companion to `PARSZARGAR-ADMIN-API-PLAN.md`, which holds the full
specification, data model and delivery phases. This file is the frontend-facing
index: for each screen of `ui-parszargar`, the endpoints it calls and the shape
it expects.

It lives here, in `goldex`, rather than in the panel repo — the API, the
reference implementation and the documentation are all maintained together, and
the `ui-parszargar` developer reads them from here.

Backend: `goldex-backend` (NestJS). Base URL `https://<host>/api/v1`.

## Where to look things up

Three sources, in the order you should reach for them:

1. **`goldex-admin-panel`** — the reference implementation. Every endpoint is
   consumed there first, so there is a working call site, in the real envelope,
   with real errors and RTL Persian, before you write yours. Its
   `API_GAP_ANALYSIS.md` maps backend endpoints to the code that calls them.
2. **Swagger** (`/swagger`, basic-auth) — request and response schemas. Note
   that response types are being added during Phase 0; until an endpoint has
   one, the admin panel's call site is the more reliable source.
3. **This file** — which endpoint belongs to which screen, and the conventions
   below.

`ADMIN-PANEL-PARITY-PLAN.md` covers how the two panels converge on
one design system and one generated client.

---

## Ground rules

| Concern | Contract |
|---|---|
| Envelope | `{ status, message, data }` — unwrap `data` in the client |
| Errors | HTTP status + `message` already localised; send `Accept-Language: fa` and toast `message` verbatim |
| Auth | `Authorization: Bearer <accessToken>`; 401 → refresh once → retry → else logout |
| Digits | API is **ASCII-only**. Convert with `toFa`/`toEn` from `utils/helpers.js` at the render boundary |
| Money | decimal **strings** + `{ currency, unit }`. **The API speaks rial (IRR); the screen speaks toman.** Convert at the render boundary and back on submit — see the money module below. Never `parseFloat` before formatting |
| Dates | ISO-8601 UTC plus a `*Jalali` twin for display; date pickers may send `YYYY/MM/DD` Jalali directly |
| Paging | `?page=&pageSize=` → `{ items, total, page, pageSize, totalPages }` |
| Search | `?q=&searchBy=` — `searchBy` values equal the `<option value>` strings already in the JSX |

## Client layer to build

```
src/api/client.js     base URL, bearer, Accept-Language, envelope unwrap, 401 refresh, toast on error
src/api/auth.js  users.js  kyc.js  roles.js  wallets.js  withdrawals.js
        trades.js  price.js  arbitrage.js  warehouse.js  accounting.js
        credit.js  reports.js  monitoring.js  settings.js  notifications.js
```

Replace `src/data/*Mock.js` and the inline `buildMock*` / `seededRnd` generators
one page at a time — the mock modules already expose store-shaped APIs
(`getKycList`/`setKycList`, `getRolesList`, `getRobotsList`), so the swap is
contained at the module boundary.

Two app-level changes are needed regardless of endpoint work:

1. **Session persistence.** `App.jsx` keeps `screen` in component state, so a
   refresh drops the operator back to login. Store the token and bootstrap from
   `GET /admin/auth/me`.
2. **Permission-aware nav.** `me.permissions[]` filters `constants/nav.js`.

---

## Screens

### Auth — `components/auth/*`
| Action | Endpoint |
|---|---|
| Login (email/username + password) | `POST /admin/auth/login` → `{ challengeId, maskedPhone, expiresIn }` |
| OTP verify | `POST /admin/auth/otp/verify` → `{ accessToken, refreshToken, admin }` |
| OTP resend (60s countdown) | `POST /admin/auth/otp/resend` |
| Forgot / reset | `POST /admin/auth/forgot-password` · `/reset-password` |
| Support form | `POST /support/contact` |
| Download page | `GET /app/releases` |

`maskedPhone` replaces the hardcoded `۰۹۱۲•••۴۸۲۱`.

### App shell — `components/layout/*`
| Element | Endpoint |
|---|---|
| Market ticker | `GET /admin/market/ticker` (**live**) + WS room `prices` |

**Reading the ticker.** Each item gives `buyPrice`/`sellPrice` in the unit
`quoteSlug` names — rial today, so divide by ten and label it toman like every
other amount. Render `sellPrice` to match the reference component. Direction
arrows are yours to derive by diffing successive polls; the API deliberately
sends no `change` field rather than inventing history it does not keep. An
instrument with no live quote comes back with null prices and `stale: true`
instead of being dropped, so a half-configured ticker is visible as such —
show it greyed rather than hiding it. `tickerKey` is the camelCase key your
`constants/prices.js` used, where one exists; key off `slug` when it is null.
Poll every 3s, or hold the `prices` socket room and use this as the fallback.
| Market open/closed | `GET /admin/market-status` + WS `market-status` |
| Online badge | `GET /admin/users/online` + WS `presence` |
| Bell dropdown / count | `GET /admin/notifications/inbox?unreadOnly=true&limit=6` · `/unread-count` |
| Sidebar identity | `GET /admin/auth/me` |

### Dashboard
KPI cards are a global filter `metric ∈ users|volume|profit|withdrawals`:
`GET /admin/dashboard/kpis` · `/series?metric=&year=` · `/distribution?metric=` ·
`/activity?metric=` · `/health?metric=` · `/recent?metric=`

### Monitoring
`metric ∈ providers|latency|rejection|alerts`:
`GET /admin/monitoring/summary` · `/metrics?metric=&points=20` · `/resources?metric=` ·
`/nodes?metric=` · `/incidents?metric=` · `POST /incidents/:id/activate|deactivate`

### Users
`GET /admin/users?q=&searchBy=name|wallet|phone|status&status=&minBalance=&maxBalance=&page=` ·
`GET /admin/users/stats` · `GET /admin/users/:id/wallets` ·
`POST /admin/users` (snake_case body, unchanged from `UserCreatePage.buildPayload`)

### KYC
`GET /admin/kyc?status=pending|approved|rejected|provider|all&searchBy=name|nationalCode|phone|status&q=&joinFrom=&joinTo=&page=&pageSize=12` ·
`GET /admin/kyc/stats` · `GET /admin/kyc/:id` ·
`POST /admin/kyc/:id/approve|reject` ·
`GET|POST /admin/kyc/:id/documents` · `DELETE .../documents/:docId`

**Rendering a stored file (receipts, KYC scans, avatars).** Never build a file
URL. Each record carries one, already signed:

| Record | Field to render |
|---|---|
| Deposit, withdrawal | `pictureUrl` |
| KYC document | `documentUrl` |
| User profile, admin user | `avatarUrl` |

Drop it straight into `<img src>` or an `<a href>` — it needs no
`Authorization` header. It expires about 15 minutes after the response that
carried it, so render it on arrival and re-fetch the record for a fresh one;
do not cache it in state you keep, put it in a URL you share, or persist it.
The sibling object name (`picturePath`, `fileUrl`, `avatarImgPath`) is a stable
identifier for support and logs — it is not fetchable on its own. `avatarUrl`
is null for a legacy avatar whose `avatarImgPath` starts `edited-`; those are
served from `/uploads/<avatarImgPath>`.

### Roles
`GET /admin/roles` · `/stats` · `/:id` · `POST` · `PATCH /:id` · `DELETE /:id` ·
`GET /admin/permissions` · `GET|PUT /admin/roles/:id/permissions`

Body matches `RoleCreatePage.handleConfirmSubmit` (`role_name`, `max_credit`,
`wallets[]`, `configs{}`, `pairs[]`). Server enforces
`credit_amount ≤ 10,000,000` and fee ≤ 3 decimals.

Each role carries a `capabilities` object — drive the disabled state off it
instead of off `isFixed`:

```jsonc
"capabilities": { "canDelete": false, "canRename": false,
                  "canEditPermissions": true, "canEditConfig": true }
```

A fixed role is editable in its wallet config and (except for the root role) its
permissions; only delete and rename are refused. `RolesPage` currently hides
delete for `isFixed`, which is right but under-specified — the badge stays, the
button logic moves to `capabilities`.

### Trades
`GET /admin/trades/stats?assetType=` ·
`/series?granularity=month|day&year=&month=&assetType=` ·
`GET /admin/trades?year=&month=&day=&assetType=&page=`

Trade id **is** the textId — row click routes to `/text-id/:id`.

### Wallets
| Screen | Endpoints |
|---|---|
| Overview | `GET /admin/wallets/overview` · `/composition?scope=` · `/operations/recent?scope=` |
| Details | `GET /admin/wallets?type=fiat\|metal\|rial\|crypto&searchBy=name\|id\|phone\|subtype\|status&…` |
| Operations | `GET /admin/wallets/operations/accounts?…&pageSize=6`, `POST /admin/operations/otp`, `POST /admin/wallets/:walletId/operations` |

Operation body: `{ type: deposit|withdraw, bucket: available|credit|frozen,
amount, challengeId, otp }` — buckets map 1:1 to the در دسترس / اعتبار / فریز
selector.

### Credit
`GET /admin/credits/stats` · `/series?metric=&granularity=month|day|hour&…` ·
`GET /admin/credits?q=&type=&minAmount=&maxAmount=&…` · `/export`

### Price engine
`GET /admin/price/instruments` (grouped by category, includes `marketOpen`) ·
`/history?symbols=&points=30` ·
`PATCH /admin/price/instruments/:id/market-status` ·
`GET|PATCH /admin/price/engine-config`

The instruments are real symbol rows server-side, carrying a `tickerKey` equal
to the camelCase key the client uses today. So **both** `data/priceInstruments.js`
and `constants/prices.js` get deleted once `/instruments` and `/market/ticker`
are live — not kept in sync by hand.

### Arbitrage
`GET|POST /admin/arbitrage/robots` · `PATCH|DELETE /:id` · `POST /:id/toggle` ·
`GET /admin/arbitrage/stats` · `/series` · `/positions` · `/providers?category=` ·
`/pairs?category=`

`PAIRS_BY_CATEGORY` and `ARBITRAGE_PROVIDERS` move server-side.

### Withdrawals
`GET /admin/withdraw?assetType=&status=&searchBy=name|owner|iban|range&…&pageSize=6` ·
`GET /admin/withdraw/stats` ·
`POST /admin/operations/otp` `{ scope:"withdraw.approve", refId }` ·
`POST /admin/withdraw/actions` (bulk)

Rows in `queue` settle with a **tracking code**, rows in `pending` with an
**OTP** — the server enforces this, keep the client rule as UX only.

### Shahin
`GET /admin/shahin/accounts` · `/:id/balance` · `/:id/statement?…` ·
`POST /admin/shahin/accounts/inquiry` · `POST /admin/operations/otp` ·
`POST /admin/shahin/transfer` `{ method: satna|paya|pol|account, … }` ·
`GET /admin/shahin/statement/export` · `GET /admin/shahin/open-banking`

### Withdrawal EM
`GET /admin/em/requests?…&pageSize=10` · `/stats` · `/requests/:id` ·
`POST /requests/:id/account` · `POST /requests/:id/receipts` (multipart) ·
`GET /admin/em/receipts/:id` (printable payload) ·
`POST /requests/:id/approve|reject` · `GET /admin/em/providers`

EM is the existing rial P2P settlement desk, so these endpoints are a read model
over it rather than a separate system — the screen needs no change, but the
statuses are a projection of the P2P state machine and may gain values the four
current tabs do not cover (escalations, expiry, partial matches). Treat the
status field as an open enum with a fallback badge.

`expiresAt` arrives as a timestamp; render the "۳ ساعت" countdown client-side —
the mock's pre-rendered duration strings go stale in an open tab.

### Provider settlement
`GET /admin/provider-finance/settlement?from=&to=&currency=` → `{ debtors, creditors }` ·
`/settlement/print`

### Partners / Providers
`GET /admin/partners?…` · `/stats` · `POST /admin/partners` · `GET /admin/users/lookup?q=`
`GET /admin/providers?category=` · `/categories` · `/stats`

### Warehouse
| Screen | Endpoints |
|---|---|
| Overview | `GET /admin/warehouse/stats?type=` · `/inventory?type=&kpi=` · `/capacity?type=` · `/packets` |
| Create | `POST /admin/warehouse/create` (`{ kind, name, address, nominal_capacity }`) |
| Documents | `GET|POST /admin/warehouse/documents` · `POST /documents/:id/attachments` · `GET /admin/warehouse/names?q=` |
| Search | `GET /admin/warehouse/search?warehouseName=&customerName=&type=&direction=&dateFrom=&dateTo=&purity=&angNumber=&…` |

Document body is discriminated by `warehouseType`: material adds
`purity`/`angNumber`, crypto adds `cryptoType`/`network`/`textId`, fiat adds
`fiatType`/`sorter`.

### Accounting
`GET /admin/accounting/stats` · `/series?metric=&granularity=&…` · `/ledger?…` · `/ledger/export`

### Accounting documents
`GET|POST /admin/accounting/vouchers` · `/vouchers/:id` ·
`POST /vouchers/:id/finalize|reject` · `GET /admin/accounting/catalogs` · `/vouchers/export`

`side` (بدهکار/بستانکار) is derived server-side from `movement`.

### textId
`GET /admin/text-ids?q=&type=&from=&to=&minAmount=&maxAmount=&page=` ·
`/:id` · `/:id/document`

### Reports — **live**
`GET /admin/reports/stats` · `GET /admin/reports?kpi=&type=&from=&to=` ·
`POST /admin/reports/generate` · `GET /admin/reports/:id` ·
`/:id/download` · `CRUD /admin/reports/schedules`

**Generating one is a poll, not a wait.** `POST /generate` answers immediately
with a job in `pending`; poll `GET /admin/reports/{id}` until `status` is
`completed`, then call `/download` for a short-lived `{ url, fileName }`. Drop
the URL straight into a link — it carries its own authorization, needs no
bearer token, and expires in about two minutes, so mint it on click rather than
holding one. A `failed` job carries `error`, which is written to be read by an
operator.

**Two options on your form do not exist on the wire.** `type` is
`trades | users | financial | withdrawals` — there is no `arbitrage`, because
those signals are never persisted and a date-ranged export of them would be
fabricated. `format` is `xlsx | csv` — there is no `pdf`; printing stays with
you, where the print CSS already lives.

`artifactExpired: true` means the file was purged at 90 days and the row is now
only an audit record — show the row, disable the download. `downloadCount` is
on every job. Everyone sees only their own reports and schedules; a super admin
sees all, and a report you may not see returns 404, not 403, so do not treat a
missing report as an error worth reporting.

The list is already scoped server-side: a super admin sees every report, anyone
else sees only their own — no client-side filtering, and no "whose report is
this" column unless the viewer is a super admin. `generate` returns a job; poll
`/:id` for status rather than blocking on the POST. Artefacts expire after 90
days and the row then reports `artifactExpired: true` — render that instead of a
dead download button.

### API management
`GET|POST /admin/api-keys` · `PATCH /:id/status` · `DELETE /:id` ·
`GET /admin/api/stats` · `/traffic?window=24h&bucket=1h`

The plaintext key is returned **once** on create — the copy button can only
copy the masked value afterwards.

### Notifications
`GET /admin/notifications/inbox` · `/unread-count` · `/stats` ·
`PATCH /:id/read` · `PATCH /read-all`

### Settings
`GET|PATCH /admin/settings/profile` · `/security` · `/notifications` · `/platform`

### Stubbed pages
`DefaultsPage`, `SupportPage`, `MarketingPage`, `CustomerOverviewPage` render a
placeholder today. Backend already covers three of the four:

| Page | Endpoint | State |
|---|---|---|
| Defaults | `GET|PATCH /admin/defaults` | to build |
| Support | `GET /admin/crm/tickets` … | exists |
| Marketing | `admin/discounts/*`, `admin/crm/segments` | exists |
| Customer overview | `GET /admin/crm/users/:userId/360` | exists |

---

## Realtime

Socket.IO `/admin` namespace, JWT-authenticated. Rooms: `prices`,
`market-status`, `presence`, `notifications`, `dashboard`, `monitoring`,
`arbitrage`. Every room has a polling fallback listed above, so the panel
degrades rather than breaks.

## Decisions that affect the client

| Decision | Client consequence |
|---|---|
| **Backend is rial, display is toman** | the panel owns the only conversion — see below |
| Ticker keys are **symbols** with a `tickerKey` | delete `constants/prices.js` and `data/priceInstruments.js` |
| EM is the **P2P desk** | status is an open enum — render unknown values, don't crash |
| Fixed roles are **editable except identity** | drive buttons off `capabilities`, not `isFixed` |
| Reports: **super admin sees all** | no client-side ownership filter |
| Monitoring comes from the **`monitor` app** | responses may carry `stale: true` + a timestamp; show the staleness rather than hiding it |

### The money module

The backend stores and serves rial; the operator reads and types toman. All
conversion lives in one file — `goldex-admin-panel/src/lib/money.ts`, ported
here — and the rule is **never store a toman value**: convert on render,
convert back on submit, keep everything in between in rial.

```js
fmtToman(rialFromApi)              // "125,000,000 تومان"
fmtBySymbol(value, symbolSlug)     // rial → toman; anything else in its own unit
tomanToRial(whatTheUserTyped)      // before it goes in a request body
```

`fmtBySymbol` matters because the conversion is symbol-scoped: a rial balance is
divided by ten, a gold balance is grams and dividing it would be nonsense.

Two failure modes to watch for in review:

- **An amount input that posts what was typed** sends a tenth of the intended
  value. Every money field goes through `tomanToRial` on submit; a raw
  `Number(input.value)` in a payload is a bug.
- **Backend logs and Swagger examples will not match the screen** — they are
  rial, the screen is toman. That is by design, not a discrepancy to fix.

`usdRial` and `usdToman` in the ticker are the same rate under two labels; with
this rule either can be rendered from one symbol.

Residual questions are in §9 of the backend plan; none block frontend work.
