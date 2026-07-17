# Admin Panel — Backend API Gap Analysis

> Snapshot of every admin-facing endpoint in `goldex-backend` vs. what
> `goldex-admin-panel/src/pages/**` is currently calling. Anything not
> marked ✅ in the front is missing and needs to be wired in.
>
> Frontend base URL is `/api/v1` (see `src/api/client.ts`), so the
> paths below are written as the front-end calls them — the global
> `v1` prefix is implied.

Legend: ✅ in use · 🟡 missing · 🆕 no page exists yet

---

## 1. Admin Auth — `src/api/auth.tsx` ✅ fully covered

| Backend | Front | Status |
|---|---|---|
| `POST /admin/auth/send-otp` | `auth.tsx:36` | ✅ |
| `POST /admin/auth/verify-otp` | `auth.tsx:40` | ✅ |
| `HEAD /admin/auth/auth` | — | 🟡 session probe (used by guard) |

## 2. Admin Management — `src/pages/AdminsPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin?role=&suspended=` | `AdminsPage.tsx:24` | ✅ |
| `POST /admin` | `AdminsPage.tsx:28` | ✅ |
| `PATCH /admin/:id/suspend` | `AdminsPage.tsx:36` | ✅ |
| `DELETE /admin/:id` | `AdminsPage.tsx:40` | ✅ |
| `GET /admin/:id` | — | 🟡 admin detail (for profile view) |
| `PATCH /admin/:id` | — | 🟡 edit admin profile / role (only suspend is wired) |

## 3. Admin KYC — `src/pages/KycPage.tsx`, `DashboardPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/kyc/admin/users?pageNumber&pageSize&searchKey` | `KycPage.tsx:143` | ✅ |
| `GET /admin/kyc/users/:userId/documents` | `KycPage.tsx:43` | ✅ |
| `POST /admin/kyc/admin/approve` | `KycPage.tsx:47` | ✅ |
| `POST /admin/kyc/admin/reject` | `KycPage.tsx:54` | ✅ |
| `GET /admin/kyc/admin/stats` | `DashboardPage.tsx:34` | ✅ |
| `GET /admin/kyc/admin/pending` | — | 🟡 dedicated pending queue view |
| `GET /admin/kyc/admin/all` | — | 🟡 full KYC history view (filters) |

## 4. Admin Monitoring — `DashboardPage.tsx`, `ComparePage.tsx`, `MappingsPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/monitoring/providers` | `DashboardPage.tsx:38`, `MappingsPage.tsx:25` | ✅ |
| `GET /admin/monitoring/pairs/:pairId/compare` | `ComparePage.tsx:53` | ✅ |
| `GET /admin/monitoring/history?provider&itemId&limit` | — | 🟡 per-item price history chart |
| `GET /admin/monitoring/current/:provider` | — | 🟡 live snapshot per provider |

## 5. Admin Pair (price pairs) — `PairsPage.tsx`, `ComparePage.tsx`, `MappingsPage.tsx`, `OrderBookPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/pair` | `PairsPage.tsx:145` (also reused) | ✅ |
| `POST /admin/pair` | `PairsPage.tsx:54` | ✅ |
| `PATCH /admin/pair/:id` | `PairsPage.tsx:54` | ✅ |
| `PATCH /admin/pair/:id/validity` | `PairsPage.tsx:153` | ✅ |
| `DELETE /admin/pair/:id` | `PairsPage.tsx:157` | ✅ |
| `GET /admin/pair/:id` | — | 🟡 pair detail modal |
| `GET /admin/pair/valid` | — | 🟡 public/valid-only list (often useful in dropdowns) |
| `GET /admin/pair/base/:baseCode` | — | 🟡 filter by base |
| `GET /admin/pair/quote/:quoteCode` | — | 🟡 filter by quote |
| `PATCH /admin/pair/:id/price` | — | 🟡 manual price override |

## 6. Admin Symbols — `SymbolsPage.tsx`, `PairsPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/symbols/active` | `SymbolsPage.tsx:145`, `PairsPage.tsx:149` | ✅ |
| `POST /admin/symbols` | `SymbolsPage.tsx:36` | ✅ |
| `PATCH /admin/symbols/:id` | `SymbolsPage.tsx:36` | ✅ |
| `PATCH /admin/symbols/:id/status` | `SymbolsPage.tsx:148` | ✅ |
| `DELETE /admin/symbols/:id` | `SymbolsPage.tsx:152` | ✅ |
| `GET /admin/symbols/:id` | — | 🟡 symbol detail |
| `GET /admin/symbols/type/:type` | — | 🟡 filter by `SymbolTypeEnum` |
| `GET /admin/symbols/slug/:slug` | — | 🟡 lookup by slug |

## 7. Admin Users — `UsersPage.tsx`, `KycPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `POST /admin/users/partners` | `UsersPage.tsx:27` | ✅ |
| `GET /admin/users/stats?from&to` | `UsersPage.tsx:100` | ✅ |
| `GET /admin/users/online` | `UsersPage.tsx:105` | ✅ |
| `GET /admin/users/users?pageNumber&pageSize&searchKey` | `UsersPage.tsx:111` | ✅ |
| `GET /admin/users/users/:id` | `KycPage.tsx:39` | ✅ |
| `PATCH /admin/users/users/:id/activation` | `UsersPage.tsx:115` | ✅ |
| `PUT /admin/users/users/:id/market-types` | — | 🟡 assign per-user market type visibility |
| `GET /admin/users/users/:id/market-types` | — | 🟡 view current market-type whitelist |

## 8. Admin Wallets — `WalletsPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/wallets/all-wallets` | `WalletsPage.tsx:85` | ✅ |
| `GET /admin/wallets/:walletId` | `WalletsPage.tsx:23` | ✅ |
| `POST /admin/wallets/update-balance` | `WalletsPage.tsx:92` | ✅ |
| `POST /admin/wallets/update-status` | `WalletsPage.tsx:104` | ✅ |
| `POST /admin/wallets/adjust-balance` | — | 🟡 atomic free/locked adjust |
| `POST /admin/wallets/freeze` | — | 🟡 freeze / unfreeze (e.g.AML hold) |
| `GET /admin/wallets/:walletId/history?startDate&endDate` | — | 🟡 balance history chart |

## 9. Admin Discounts / Coupons — 🆕 no page exists

> Backend has a full controller (`discount-admin.controller.ts`) but the
> admin panel has **no Discounts page at all**. This is the largest gap.

| Backend | Status |
|---|---|
| `GET /admin/discounts/coupons?pageNumber&pageSize&searchKey` | 🆕 list coupons |
| `GET /admin/discounts/coupons/:id` | 🆕 coupon detail (admin-scoped) |
| `POST /admin/discounts/coupons` | 🆕 create coupon |
| `PATCH /admin/discounts/coupons/:id` | 🆕 edit coupon |
| `PATCH /admin/discounts/coupons/:id/activation` | 🆕 toggle active |

## 10. Admin Orders — `OrdersPage.tsx`, `OrderBookPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/orders` | `OrdersPage.tsx:49` | ✅ |
| `DELETE /admin/orders/:id/cancel` | `OrdersPage.tsx:53` | ✅ |
| `GET /admin/orders/book/:pairId` | `OrderBookPage.tsx:66` | ✅ |
| `GET /admin/orders/arbitrage/:pairId` | `OrderBookPage.tsx:75` | ✅ |
| `GET /admin/orders/:id` | — | 🟡 order detail (currently only fetched via the list) |
| `PUT /admin/orders/:id` | — | 🟡 admin-edit order (status, price, etc.) |

## 11. Admin Warehouse — `WarehousePage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/warehouse/all` | `WarehousePage.tsx:217, 641` | ✅ |
| `POST /admin/warehouse/create` | `WarehousePage.tsx:102` | ✅ |
| `PUT /admin/warehouse/:id` | `WarehousePage.tsx:102` | ✅ |
| `DELETE /admin/warehouse/:id` | `WarehousePage.tsx:712` | ✅ |
| `GET /admin/warehouse/overview` | `WarehousePage.tsx:635` | ✅ |
| `POST /admin/warehouse/packets` | `WarehousePage.tsx:222` | ✅ |
| `GET /admin/warehouse/packets` | `WarehousePage.tsx:646, 670` | ✅ |
| `PUT /admin/warehouse/packets/:id` | `WarehousePage.tsx:718` | ✅ |
| `GET /admin/warehouse/requests` | `WarehousePage.tsx:651` | ✅ |
| `GET /admin/warehouse/requests/pending-withdraw` | `WarehousePage.tsx:662` | ✅ |
| `PUT /admin/warehouse/requests/:id/process` | `WarehousePage.tsx:373` | ✅ |
| `PUT /admin/warehouse/requests/:id/confirm-material` | `WarehousePage.tsx:302, 700` | ✅ |
| `POST /admin/warehouse/requests/:id/approve-withdraw` | `WarehousePage.tsx:470` | ✅ |
| `GET /admin/warehouse/settlement-material/balance` | `WarehousePage.tsx:656` | ✅ |
| `POST /admin/warehouse/settlement-material/release` | `WarehousePage.tsx:579` | ✅ |
| `GET /admin/warehouse/today-stats` | `WarehousePage.tsx:684` | ✅ |
| `GET /admin/warehouse/today-export` | `WarehousePage.tsx:692` | ✅ |
| `GET /admin/warehouse/users/:userId/packets` | `WarehousePage.tsx:459` | ✅ |
| `POST /admin/warehouse/packets/:id/picture` | — | 🟡 standalone picture upload |
| `GET /admin/warehouse/packets/:id/picture` | — | 🟡 picture preview (used inside detail modal) |
| `GET /admin/warehouse/packets/:id` | — | 🟡 packet detail modal |
| `DELETE /admin/warehouse/packets/:id` | — | 🟡 delete packet |
| `GET /admin/warehouse/requests/:id` | — | 🟡 request detail (currently inlined in list) |
| `POST /admin/warehouse/requests/:id/assign-packet/:packetId` | — | 🟡 manual packet assignment to a withdraw |
| `GET /admin/warehouse/:id` | — | 🟡 warehouse detail page (cards / capacity timeline) |

## 12. Admin Financial — `DashboardPage.tsx`, `FinancePage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/financial/summary` | `DashboardPage.tsx:25` | ✅ |
| `GET /admin/financial/profit?from&to&interval` | `DashboardPage.tsx:30`, `FinancePage.tsx:75, 80` | ✅ |
| `GET /admin/financial/provider-deals` | `DashboardPage.tsx:43` | ✅ |
| `GET /admin/financial/stats?from&to` | `FinancePage.tsx:67` | ✅ |
| `GET /admin/financial/orders?limit&offset&from&to` | `FinancePage.tsx:149` | ✅ |
| `GET /admin/financial/transactions?limit&offset&type` | `FinancePage.tsx:185` | ✅ |
| `GET /admin/financial/ledger?limit&offset` | `FinancePage.tsx:218` | ✅ |
| `GET /admin/financial/providers` | — | 🟡 per-provider liquidity snapshot |
| `GET /admin/financial/customers?limit&offset` | — | 🟡 customers × balances table (separate from per-asset summary) |

## 13. Admin Provider Finance — `ProviderFinancePage.tsx` ✅ fully covered

| Backend | Front | Status |
|---|---|---|
| `GET /admin/provider-finance/overview` | `ProviderFinancePage.tsx:46` | ✅ |
| `GET /admin/provider-finance/settlements?provider` | `ProviderFinancePage.tsx:50` | ✅ |
| `POST /admin/provider-finance/settle` | `ProviderFinancePage.tsx:54` | ✅ |

## 14. Admin Provider Pair Mappings — `MappingsPage.tsx`

| Backend | Front | Status |
|---|---|---|
| `GET /admin/pair-mappings/all` | `MappingsPage.tsx:29` | ✅ |
| `POST /admin/pair-mappings` | `MappingsPage.tsx:33` | ✅ |
| `DELETE /admin/pair-mappings/:id` | `MappingsPage.tsx:40` | ✅ |
| `GET /admin/pair-mappings/available-items` | — | 🟡 dropdown data when creating a mapping |
| `GET /admin/pair-mappings/:id` | — | 🟡 mapping detail (currently inlined) |
| `GET /admin/pair-mappings/provider/:providerKey` | — | 🟡 filter list by provider |
| `GET /admin/pair-mappings/pair/:pairId` | — | 🟡 filter list by pair |
| `PATCH /admin/pair-mappings/:id` | — | 🟡 edit useBuyPrice / useSellPrice flags (no edit UI today) |

---

## Summary — what to add to the admin panel

### 🆕 Whole new page needed
- **Discounts / Coupons** — no `DiscountsPage.tsx` exists; all 5 endpoints
  (`GET/POST/PATCH` for `/admin/discounts/coupons` + activation toggle) are
  untouched.

### 🟡 Endpoints the backend has but the front never calls
- **Admin Management**: edit profile (`PATCH /admin/:id`), view detail (`GET /admin/:id`).
- **Admin KYC**: `GET /admin/kyc/admin/pending` and `GET /admin/kyc/admin/all` (no dedicated
  list views today).
- **Admin Monitoring**: per-item history (`GET /admin/monitoring/history`),
  per-provider current snapshot (`GET /admin/monitoring/current/:provider`).
- **Admin Pair**: `GET /admin/pair/:id`, `/valid`, `/base/:baseCode`, `/quote/:quoteCode`,
  `PATCH /admin/pair/:id/price`.
- **Admin Symbols**: `GET /admin/symbols/:id`, `/type/:type`, `/slug/:slug`.
- **Admin Users**: `PUT/GET /admin/users/users/:id/market-types` (no UI for partner
  market-type whitelist).
- **Admin Wallets**: `POST /admin/wallets/adjust-balance`, `POST /admin/wallets/freeze`,
  `GET /admin/wallets/:walletId/history`.
- **Admin Orders**: `GET /admin/orders/:id` (order detail page/modal), `PUT /admin/orders/:id`.
- **Admin Warehouse**: `GET/POST /admin/warehouse/packets/:id/picture`,
  `GET/DELETE /admin/warehouse/packets/:id`, `GET /admin/warehouse/requests/:id`,
  `POST /admin/warehouse/requests/:id/assign-packet/:packetId`,
  `GET /admin/warehouse/:id`.
- **Admin Financial**: `GET /admin/financial/providers`, `GET /admin/financial/customers`.
- **Provider Pair Mappings**: `GET /admin/pair-mappings/available-items`,
  `GET /admin/pair-mappings/:id`, `GET /admin/pair-mappings/provider/:providerKey`,
  `GET /admin/pair-mappings/pair/:pairId`, `PATCH /admin/pair-mappings/:id`.
- **Auth guard**: `HEAD /admin/auth/auth` (silent session probe).
