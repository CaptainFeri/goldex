# HANDOFF — Parszargar UI × Goldex integration

**Status:** planning complete, no implementation started.
**Date:** 2026-09-04
**Branch (both repos):** `claude/ui-goldex-admin-plan-40u9fs`

| Document | Repo | Covers |
|---|---|---|
| `PARSZARGAR-ROADMAP.md` | both (mirrored; `ROADMAP.md` in the UI repo) | sequencing, milestones, dependency graph, risk register |
| `PARSZARGAR-BACKEND-PLAN.md` | `goldex` (this repo) | backend scope |
| `PARSZARGAR-GOLDEX-PLAN.md` | `ui-parszargar` | frontend scope |

The two plans are one plan split along the repo boundary and cross-reference
each other by section number. The roadmap sequences them. Start with the
roadmap; drop into a plan when you pick up a phase.

---

## 1. What was done

A read-only audit of three codebases, a two-part implementation plan, and a delivery roadmap. **No
source files were changed** — the only additions are the plan documents, the
roadmap, and this handoff.

Audited:
- `ui-parszargar` — 41 pages, 24 components, 16,868 LOC of pages, 5,914-line CSS
- `goldex/goldex-admin-panel` — 57 page files, 38 routes, 8 API modules
- `goldex/goldex-backend` — 57 controllers, 74 entities, 54 modules; every
  admin route decorator was enumerated

## 2. The three findings that drive everything

1. **Parszargar has no backend integration whatsoever.** Not partial — zero.
   Every screen renders literals or `Math.random()`. Auth compares against a
   hardcoded credential pair in `src/components/auth/Login.jsx`. The four
   commented-out `fetch` calls are the entire trace of an intended API.

2. **The two panels are complementary, not competing.** Parszargar owns the
   design system, RTL/Jalali handling and information architecture; Goldex owns
   the API surface, the auth flow, realtime, and ~14 feature domains Parszargar
   has never modelled (CRM, credit settlement, P2P, CBP, market config, order
   book, levels, discounts, OCR, telegram market, market status, bank accounts,
   admin management, finance logs).

3. **Eight Parszargar domains have no backend at all** and need new modules:
   custom RBAC, accounting/vouchers, reports, partners, infra health, arbitrage
   robots, textId, system settings. RBAC is the blocker — the shell cannot
   render permission-aware navigation until `verify-otp` returns a permission
   list.

## 3. Start here

Order matters. Both tracks are gated on the same two items.

1. **Answer the open questions** — `PARSZARGAR-BACKEND-PLAN.md` §5 and
   `PARSZARGAR-GOLDEX-PLAN.md` §6. Two of them (is this replacing
   `goldex-admin-panel`? do per-role limits govern admins or end users?) change
   the scope of whole phases, not just details. **Do not start B1 or F3 before
   these are answered.**
2. **Backend B0** — fix the Shahin controller path, add `permissions` to the
   `verify-otp` response, stub `admin/settings`. Small, unblocking.
3. **Frontend F0** — data layer, auth, router rewrite, page primitives. The
   router rewrite touches all 41 pages; land it alone, before any data wiring,
   while the pages are still mock-driven.
4. Then B1–B6 and F1–F7 in parallel per the phase tables.

## 4. Traps

- **`ProvidersPage` in Parszargar is not `admin/providers`.** Its filters are
  `server, accountingServer, sms, version, logs, disk, auth1/2, ocr1/2, bale,
  eitaa, telegram` — it is an infra health board. Wiring it to the provider
  module would be wrong.
- **`@Controller('api/shahin')`** sits under a global `api` prefix and `v1`
  versioning, so it currently resolves to `/api/v1/api/shahin/*`. Fix the
  controller; do not hard-code the double prefix in the UI.
- **`SymbolTypeEnum` (`fiat|crypto|material|rial`) already matches** Parszargar's
  wallet tabs and warehouse types exactly. Use it verbatim — do not invent a
  parallel vocabulary.
- **`WalletEntity` already has** `freeBalance / lockedBalance / creditBalance /
  frozenFreeBalance / frozenLockedBalance`, which covers the
  available/credit/frozen buckets in `WalletOperationsPage` with no migration.
- **Jalali strings must never reach a request body.** Convert at the API layer.
- **Re-skinning is the hidden cost.** Porting a Goldex page is not a copy — it
  is a rewrite into a 5,914-line design system, in RTL, across two themes.
  Budget roughly a day per non-trivial page.

## 5. Not decided

- Whether `goldex-admin-panel` is retired or kept. Everything in §3 of the
  frontend plan assumes retirement.
- Whether the accounting module is a real double-entry ledger of record or a
  reporting overlay on `system-ledger`.
- Whether `textId` mints a new reference or projects an existing upstream one.
- Whether arbitrage robots place real orders or are paper/alert configs.
- `ApiPage` (public API keys) is **deferred** — it advertises a product that
  does not exist. Remove the nav entry or label it a mock.
