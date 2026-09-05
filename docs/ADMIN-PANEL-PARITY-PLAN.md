# `goldex-admin-panel` ↔ `ui-parszargar` parity plan

Goal, as stated: bring **`goldex-admin-panel`** (styles and features) to match
**`ui-parszargar`**, cover everything the API plan changes, and use the panel
plus Swagger as the working documentation for the developer building
`ui-parszargar`.

Companion to `PARSZARGAR-ADMIN-API-PLAN.md` (the API spec) and
`UI-PARSZARGAR-API-CONTRACT.md` (the client-side index). Read that plan
first — this one assumes its §5 endpoint numbering.

---

## 1. The headline finding

**Swagger cannot do the job asked of it today.** It documents inputs and almost
nothing else:

| Measure | Count |
|---|---|
| Routes | 444 |
| Routes with `@ApiOperation` | 276 (62%) |
| Controllers with `@ApiTags` | 50 / 57 |
| Request DTO files | 126 |
| **Routes declaring a response type** | **0** |
| Response DTO files | 3 |

A frontend developer's first question is *what comes back*, and that is exactly
what the spec does not say. It is also why no client can be generated: every
operation would return `any`.

There is a second, subtler problem. `ResponseInterceptor` wraps every handler in
`{ status, message, data }`, and controllers return `{ data: await ... }`
literals with no declared return type — so even once response DTOs exist,
Swagger will document the *inner* shape while the wire carries the envelope,
unless the envelope is modelled explicitly.

Fixing this outranks the styling work. Everything else in this document assumes
§5 (Swagger hardening) is happening in parallel from day one.

---

## 2. Where the two panels actually stand

Both exist, both are real, and they have diverged in almost every technical
choice.

| | `ui-parszargar` | `goldex-admin-panel` |
|---|---|---|
| React | 19 | 18 |
| Language | JavaScript (JSX) | **TypeScript** |
| Router | react-router 7 | react-router 6 |
| Charts | **recharts** (9 pages) | Chart.js + react-chartjs-2 (7 pages) |
| Icons | **lucide-react** (47 imports) | emoji string literals (45 nav entries) |
| Animation | **framer-motion** (15 files) | none |
| Toasts | react-toastify | custom `NotifyProvider` |
| Dates | react-multi-date-picker, **Jalali** | date-fns, Gregorian |
| Data layer | none — mocks | **TanStack Query + axios**, real API |
| Styling | `App.css`, **5,914 lines, 648 `gx-*` classes**, dark + light | `index.css`, 1,030 lines, dark only |
| Realtime | none | **socket.io-client**, admin socket wired |
| Size | ~19.8k LOC, 41 routes | ~20.7k LOC, 40 routes |

Neither is a subset of the other. Each has roughly a third of the surface the
other lacks:

**Only in `goldex-admin-panel`** — and these are *working, API-wired* pages, not
mocks: Compare, Symbols, Pairs, Provider Mappings, CBP gateways, Order Book,
Discounts, Finance Logs, User Levels, Deposits, Bank Accounts, P2P escalations,
P2P settings, OCR admin, Telegram market, Admins, and the seven-page CRM suite
(dashboard, users, user-360, tickets, ticket detail, tags, segments). The Credit
section alone is 20 files deep with a settlement-workflow stepper.

**Only in `ui-parszargar`**: Monitoring, dynamic Roles (×4 screens), Trades
drill-down, Wallet details, Wallet operations, Price engine, Arbitrage robots
(×3), Shahin, Withdrawal EM, Provider settlement, Partners (×2), Warehouse
document + search + create, Accounting documents, Reports, textId (×2), API
keys, Settings, Defaults, Support, Marketing, Customer overview, User create,
KYC detail.

So "make the admin panel the same as ui-parszargar" is really three separate
jobs, and only the first is what it sounds like.

---

## 3. The strategic problem, and the recommendation

Two panels, two stacks, one required appearance and feature set, maintained by
hand, will drift within a sprint. The 5,914-line stylesheet is the obvious
tripwire: copy it once and every subsequent change has to be made twice, in two
languages, by whoever remembers.

I'd raise this before the work starts rather than after: **the parity is worth
having, the duplication is not.** Three ways to get there.

| | Approach | Cost | Drift risk |
|---|---|---|---|
| A | Copy the CSS and rebuild pages in each repo, keep them in sync by discipline | lowest to start | **high** — permanent double work |
| B | **Extract two shared packages — design system and generated API client — consumed by both panels** | ~1 sprint up front | **low** — divergence becomes a build error |
| C | Retire one panel once the other reaches parity | highest short-term | none |

**Recommendation: B.** Two packages, versioned in the `goldex` monorepo and
consumed by `ui-parszargar`:

```
packages/goldex-ui/          the gx-* stylesheet, tokens, and the 14 primitives
packages/goldex-api-client/  TypeScript client generated from the OpenAPI spec
```

That makes "same styles" a dependency version rather than a promise, and it
makes the admin panel genuinely useful as documentation: the ui-parszargar
developer imports the same client the reference implementation uses, against
types generated from the same spec.

If B is rejected for delivery-speed reasons, say so explicitly and budget the
double-maintenance — it is a real line item, not a rounding error.

C is worth a moment's thought too. The honest question is whether the business
needs two admin panels at all, or whether `goldex-admin-panel` is really *the
reference implementation and staging ground* while `ui-parszargar` is the
product. If that is the intent — and the framing of it as documentation
suggests it is — then §6 describes the discipline that makes it work.

---

## 4. Workstream A — the design system port

`ui-parszargar`'s look is plain CSS with a `gx-` prefix and CSS custom
properties. No Tailwind, no CSS-in-JS, no build step. That makes it portable;
the work is mechanical, not creative.

**A1. Extract `packages/goldex-ui`** (1 wk)
- Move `App.css` verbatim, then split: `tokens.css` (the two theme blocks —
  `.theme-dark` / `.theme-light`, ~60 custom properties), `base.css`,
  `components.css`, `pages.css`. De-duplicate as you split; a 5.9k-line
  single file has accumulated repetition.
- Port the 14 primitives (296 lines total in `components/ui/`): `Card`, `Kpi`,
  `Btn`, `Badge`, `Table`, `Field`, `Toggle`, `ConfirmModal`, `Dot`,
  `ProgressBar`, `Avatar`, `UserCell`, `ChartTooltip`. Write them **in
  TypeScript** with prop types — the panel is TS, and typed primitives are part
  of what makes it documentation.
- Ship the fonts (`IRANSansWeb`, `Vazirmatn`, `Shabnam`, `B Zar`) and the 32
  bank SVGs as package assets.
- Both panels then import `@goldex/ui/tokens.css` and the primitives. The
  visual contract lives in one place.

**A2. Align the rendering stack** (1 wk) — required for "same styles" to be
achievable at all:
- **Charts: Chart.js → recharts.** The larger of the two migrations, touching 7
  admin-panel pages. Non-negotiable if the charts are to look the same — the two
  libraries do not produce interchangeable output, and `ui-parszargar` styles
  its charts through recharts props (`ChartTooltip`, gradient `defs`,
  `CartesianGrid` colours from the theme).
- **Icons: emoji → lucide-react.** 45 nav entries plus in-page usage. Cheap and
  it is most of the visual difference in the sidebar.
- **Add framer-motion** for page transitions, the feed stagger and modal
  entrances — 15 files' worth of behaviour in `ui-parszargar`.
- **Toasts: `NotifyProvider` → react-toastify**, RTL-configured, top-left, as
  `App.jsx` sets up.
- **React 18 → 19, router 6 → 7.** Both are prerequisites for sharing
  components. Do them first; they are the riskiest part of A2 and the most
  mechanical.

**A3. RTL and Jalali** (3 days)
- `ui-parszargar` renders Persian digits everywhere via `toFa`/`toEn`; the admin
  panel does not. Move those helpers into `@goldex/ui` and apply at the render
  boundary only — the API stays ASCII (API plan §3).
- Swap date-fns pickers for `react-multi-date-picker` with the Persian calendar,
  and consume the `*Jalali` twin fields the backend now returns.

**A4. Shell parity** (3 days)
- Rebuild `Layout.tsx` against `AppShell.jsx`: collapsible nav groups, submenu
  expansion, ⌘K search, market ticker marquee, online-count badge, notification
  bell dropdown, theme toggle, the sidebar user footer.
- The admin panel has no light theme at all. It comes free once tokens are
  shared, provided no page hardcodes a colour — audit for that during A1.

---

## 5. Workstream B — feature parity

Parity should be the **union**, not the intersection. Deleting the admin panel's
working Symbols/Pairs/CBP/OCR/CRM pages to match `ui-parszargar` would destroy
functioning tooling to satisfy a symmetry no one benefits from.

**B1. Restyle what already exists** (2 wks) — 40 admin-panel routes get the
`@goldex/ui` treatment: KPI cards where there are stat rows, `Card` wrappers,
the shared `Table`, `Badge` variants, the filter-bar pattern
(`gx-users-filters` — search mode selector + range inputs + "پاک کردن فیلترها")
that `ui-parszargar` repeats on nine pages. Mostly markup and class swaps.

**B2. Build the missing pages in the admin panel** (6 wks) — in API-plan phase
order so each lands as its endpoints do:

| Phase | Pages | API plan |
|---|---|---|
| 2 | Roles ×4, User create, KYC detail | §5.6, §5.7 |
| 3 | Wallet details, Wallet operations, Credit drill-down | §5.10–5.12 |
| 4 | Withdrawals (asset/status matrix), Shahin ×4 tabs, EM, Provider settlement | §5.15–5.18 |
| 5 | Trades drill-down, Price engine, Arbitrage robots ×3 | §5.8, §5.13, §5.14 |
| 6 | Warehouse document, Warehouse search, Warehouse create | §5.20 |
| 7 | Accounting documents, textId ×2, Reports | §5.19, §5.22, §5.23 |
| 8 | Monitoring, Partners ×2, API keys, Settings, Dashboard filters | §5.3–5.4, §5.24, §5.26 |

**B3. Feed the surplus back the other way** (planning only, no code) — the 20
pages that exist only in the admin panel become the `ui-parszargar` roadmap.
Four of them are already stubs there (`DefaultsPage`, `SupportPage`,
`MarketingPage`, `CustomerOverviewPage` all render "این صفحه در حال توسعه است")
and three of those map onto CRM pages the admin panel has working today. That is
the cheapest parity win available and it should be taken early.

---

## 6. Workstream C — cover the API changes

Every decision in the API plan's §9 log has an admin-panel consequence. The
panel is the first consumer, so it is where each change gets proven:

| Change | Admin panel work |
|---|---|
| **IRT end to end** (§3.1) | Audit every amount render. The panel currently shows raw balances; after the ÷10 migration a stale format helper is a silent factor-of-10 display bug. Centralise in `@goldex/ui/format` and unit-test it. |
| **Rial at the bank edge** (§3.2) | CBP and Bank Accounts pages show bank-side values — label the unit explicitly on those screens, they are the one place IRR legitimately appears. |
| **Ticker symbols** (§4.5) | Symbols page gains `tickerKey`, `isTicker`, `displayOrder`, `category`; it becomes the admin surface for the ticker itself. |
| **Dynamic roles** (§5.7) | Admins page moves from the 4-value enum to role assignment; add the permission matrix; drive buttons off `capabilities`. |
| **Operation OTP** (§4.3) | One shared `<OtpGate>` component wrapping the five money-moving flows — build it once here, and `ui-parszargar` imports it from `@goldex/ui`. |
| **EM = P2P** (§5.17) | The existing P2P escalations page and the EM screen are two views of one dataset. Build EM as a second view in the same module, not a parallel one. |
| **Monitoring via `monitor`** (§5.4) | New page; must render `stale: true` snapshots visibly rather than hiding them. |
| **Reports visibility** (§5.23) | Ownership-scoped list; render `artifactExpired` instead of a dead download button. |
| **Permission-gated nav** (§4.2) | Both panels filter navigation from `me.permissions[]` — shared helper. |

---

## 7. Workstream D — making it real documentation

This is the workstream that determines whether the stated goal is met, and it is
the one with the most work hiding in it.

**D1. Swagger hardening** (2 wks, starts immediately, runs alongside API Phase 0)

1. **Response DTOs for every endpoint.** 444 routes, zero typed today. Start
   with the ~70 the panels already call, then every new endpoint ships with one
   — enforced in review, then in CI.
2. **Model the envelope.** An `@ApiEnvelope(Dto)` decorator built on
   `ApiExtraModels` + `getSchemaPath` that documents
   `{ status, message, data: Dto }` — otherwise every generated type is wrong at
   the outermost level.
3. **Paginated generic.** One `PaginatedDto<T>` so `{ items, total, page,
   pageSize, totalPages }` is documented once and reused.
4. **Fill the gaps:** `@ApiOperation` on the 168 routes without one, `@ApiTags`
   on the 7 controllers missing it, `@ApiQuery` for every filter in API plan
   §3's search trio, and error responses with the i18n message keys.
5. **Examples matter more than schemas here.** A Persian-reading frontend
   developer gets more from a realistic `@ApiProperty({ example: ... })` — a
   real IBAN shape, a real Jalali date, a real decimal string — than from a type
   name. Make examples a review requirement.
6. **Publish the spec as a build artefact** (`openapi.json`) so it can be
   diffed, versioned, and fed to codegen.

**D2. Generated client** (1 wk)
- `openapi-typescript-codegen` (or `orval`, which emits TanStack Query hooks
  directly and matches the panel's existing data layer) → `@goldex/api-client`.
- Regenerated in CI on every spec change. A breaking API change then fails the
  panel's typecheck, which is the entire point: the documentation cannot go
  stale without someone noticing.
- `ui-parszargar` is JavaScript today, so it gets the client's runtime and the
  types as editor-only assistance via JSDoc. Adopting TypeScript there would
  make this materially better and is worth a separate conversation.

**D3. Keep `API_GAP_ANALYSIS.md` alive** — the panel already ships a
backend-endpoint-vs-frontend-usage matrix with ✅/🟡/🆕 markers. That is exactly
the artefact the ui-parszargar developer needs. Extend it to all ~180 endpoints
and **generate it** from the OpenAPI spec plus a scan of the panel's client
calls, rather than maintaining it by hand.

**D4. Reference-implementation discipline** — the rule that makes the panel
documentation rather than just another app:

> Every endpoint is consumed by `goldex-admin-panel` **before** it is consumed
> by `ui-parszargar`.

The panel proves the endpoint works, in its real envelope, with real errors,
Persian text and RTL layout. What the ui-parszargar developer then reads is a
working call site next to a typed spec — not prose that may be out of date.

Support it with: Storybook for `@goldex/ui` (the visual contract, browsable);
a `docs/RECIPES.md` for the cross-cutting flows a spec cannot express — how the
OTP gate works end to end, how the search-mode filter bar maps to query params,
how Jalali input reaches the API, how the socket rooms are joined.

---

## 8. Sequencing

Runs alongside the API plan's phases, not after them.

| Sprint | Workstream | Output |
|---|---|---|
| 1 | D1 starts · A2 (React 19, router 7, recharts, lucide) | spec gains response types; stacks aligned |
| 2 | A1 `@goldex/ui` extracted · D1 continues | one design system, two consumers |
| 3 | A3 + A4 · D2 generated client | shell parity, typed client in CI |
| 4–5 | B1 restyle 40 routes · C changes as API phases land | the panel looks like the product |
| 6–11 | B2 missing pages, phase-aligned | feature parity |
| ongoing | D3 + D4 | documentation that cannot silently rot |

Roughly 11 sprints of frontend work alongside the API plan's 9 phases. The two
converge at the end of API phase 8.

**Do A2 before A1.** Extracting a shared component library across two different
React majors and two chart libraries means doing it twice.

---

## 9. Decisions needed

1. **Shared packages (option B) or copy-and-sync (option A)?** Everything in
   §4–§7 assumes B. Under A, add roughly 40% to every subsequent estimate and
   accept that the panels will diverge.
2. **Does `ui-parszargar` adopt TypeScript?** Not required, but it is the
   difference between the generated client being enforced and being advisory.
3. **Is `goldex-admin-panel` permanent, or a staging ground?** It changes how
   much polish B1 deserves. If it is permanent, it needs the light theme, the
   animations and the responsive work. If it is a reference implementation,
   correctness and coverage matter and pixel-perfection does not.
4. **Who owns `@goldex/ui`?** A shared package with two consumers and no owner
   becomes a merge-conflict surface. One team, with the other raising PRs.
5. **The 20 admin-panel-only pages** — roadmap for `ui-parszargar`, or
   permanently admin-panel-only? Affects whether B1 restyles them fully.
