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
| **Rial stored, toman displayed** (§3.1) | **Landed** — `src/lib/money.ts` plus the money-screen call sites; see §6.1. Move the module into `@goldex/ui` when that package is extracted, so both panels share one conversion. |
| **Ticker symbols** (§4.5) | Symbols page gains `tickerKey`, `isTicker`, `displayOrder`, `category`; it becomes the admin surface for the ticker itself. |
| **Dynamic roles** (§5.7) | Admins page moves from the 4-value enum to role assignment; add the permission matrix; drive buttons off `capabilities`. |
| **Operation OTP** (§4.3) | One shared `<OtpGate>` component wrapping the five money-moving flows — build it once here, and `ui-parszargar` imports it from `@goldex/ui`. |
| **EM = P2P** (§5.17) | The existing P2P escalations page and the EM screen are two views of one dataset. Build EM as a second view in the same module, not a parallel one. |
| **Monitoring via `monitor`** (§5.4) | New page; must render `stale: true` snapshots visibly rather than hiding them. |
| **Reports visibility** (§5.23) | Ownership-scoped list; render `artifactExpired` instead of a dead download button. |
| **Permission-gated nav** (§4.2) | Both panels filter navigation from `me.permissions[]` — shared helper. |

### 6.1 The rial → toman display audit

The panel renders ~295 amounts through some `fmtNum`. **Most are not rial** —
gold grams, USDT, percentages, counts, prices in non-rial quotes — so a blanket
conversion would be worse than none. The audit is therefore per call site, and
this is where it stands.

**Converted** — operator-facing money, symbol known or rial by construction:

| Screen | What |
|---|---|
| Withdraws | the amount being approved, via `fmtBySymbol` |
| Deposits | the amount being processed, via `fmtBySymbol` |
| Bank accounts | daily/per-tx limits, **display and edit form** |
| P2P escalations | admin liquidity, per-symbol breakdown, today's settled total, match amount |
| P2P settings | the two-person approval threshold input |
| Dashboard | the IRR customer-balance and system-profit tiles |
| Wallets | balances by the wallet's symbol; the adjust, freeze and quick-prompt forms convert on submit and name their unit |
| Orders | quantity in the pair's base, price and total value in its quote; the admin edit form's price field converts both ways |
| Finance | order, transaction, ledger, provider-balance and customer-balance rows, each by the symbol on the row |
| Credit | `creditLimit`, `usedCredit` and the `*Value` fields by `creditBaseSymbol`; collateral by `collateralSymbol`; the adjust-limit modal converts display and input together |
| Order book | ladder price by the pair's quote and size by its base, plus the depth, best bid/ask and spread columns |
| Pairs | best buy/sell price by the quote; min/max buy/sell by the base |
| Provider finance | outstanding, traded and settled balances by their symbol, and the settlement amount field |
| Levels | the `{ amount, currency }` feature limits, **display and the edit field** |
| CBP | payment amounts, by the joined symbol's slug |

**Deliberately not converted:**

- **OCR amount fields** on Withdraws and Deposits. Those transcribe what is
  printed on a bank receipt, and the receipt is in rial. Converting would stop
  the field matching the document the operator is reading off.
- **Counts** — pending withdrawals, unmatched deposits, escalations. `fmtNum` is
  correct for these; they are not money.
- **Non-rial amounts** — gold grams, USDT balances, and prices quoted in other
  symbols. `fmtBySymbol` leaves them in their own unit, which is why it takes
  the symbol rather than assuming.
- **Arbitrage.** That subsystem works in toman end to end: the signals come from
  an external scan engine whose fields are named `profitToman` and
  `bestProfitToman`, and its config threshold is `minProfitToman`. It is not on
  the platform's rial ledger, so converting it would *introduce* the ten-fold
  error rather than remove one.
- **`commission` on an order** and **`buyCommission`/`sellCommission` on a
  pair.** Both are `decimal(10,2)`, too narrow to hold a rial order total and
  shaped like a rate; neither entity records a unit. Guessing wrong here costs
  exactly what this audit is removing, so they stay as they are until the unit
  is established. The order screen carries a comment saying so.
- **`bridgeRate`, `spreadPercent`, `leverage`, drawdown percentages.** Rates and
  ratios, not amounts.
- **Compare and Telegram market, entirely.** Both render an external feed that
  is already in toman. The pricing engine settles it arithmetically rather than
  by naming: `arbitrage.service.ts` computes `profitToman = bestSell.buyPrice -
  bestBuy.sellPrice` from the very same `buyPrice`/`sellPrice` fields these
  screens display. The telegram monitor documents its own figures as Toman
  throughout. Converting either would introduce the error, not remove it.
- **Discounts.** `discountAmount` and `maxDiscount` carry no symbol, and
  nothing outside the discount module consumes them — the feature is stored and
  displayed but never applied, so the unit was never established. `usageCount`,
  `usageLimit` are counts and `discountPercentage` is a percentage.
- **`gain` on a symbol.** It is an absolute amount or a percentage depending on
  the row's `gainType`, and the row names no quote symbol, so it is ambiguous
  in both directions.
- **Users.** Every figure on it is a count.
- **Warehouse, entirely.** All 42 sites are gram weights. The module's four
  entities carry no money column at all — only `pure_weight`,
  `apparent_weight`, `capacity_total/used/remaining` and a request `weight` —
  and the settlement-material balance that looks like a ledger is a query
  filtered to `symbol = "XAU"`, so `totalReceived` / `totalPaid` / `netBalance`
  are grams too. The page was already correct; the audit's answer here is to
  change nothing.

**The audit is complete.** Every screen has been walked. The result splits
roughly three ways: screens converted, screens whose figures were never money
(warehouse weights, user counts), and screens already in toman because they
render an external feed (arbitrage, compare, telegram market).

One backend bug fell out of the CBP screen. `deposit.service.ts` and
`withdraw.service.ts` published `currency: symbol.name` onto the payments bus —
the rial symbol's name is `"ریال ایران"`, a localized label, where the gateway
integrations set `"IRR"`. A machine field on a payments rail carrying a display
string cannot be compared by any consumer, so both now send `symbol.slug`,
which is what `symbolSlug` in the same payload already carried. The panel
prefers the joined `symbol.slug` and falls back to `currency`, so rows written
either way format correctly and anything unrecognised is left unconverted
rather than guessed.

### 6.2 Digit rendering

Auditing Warehouse turned up the inconsistency underneath the money work rather
than another conversion. `fmtNum` rendered `en-US`, so a Latin-digit count sat
next to a Persian-digit amount on the same row, while `fmtDate` had always been
`fa-IR` and `credit/labels.ts` had its own `fa-IR` copy of `fmtNum`.

ui-parszargar settles it: `utils/helpers.js` puts **every** number through
`toFa`, counts and percentages included, and its `fmt` produces exactly the
string `toLocaleString("fa-IR")` does — verified digit-for-digit, and now
asserted by `format.spec.ts`, which formats through ui-parszargar's own function
and compares. So `fmtNum` is `fa-IR`, which aligns roughly 300 sites in one
place.

Safe because `fmtNum` is display-only: no `<input>`, `Number()`, `key` or
`href` consumes it, and the CSV export builds its rows from the raw data rather
than the formatter, so downloads stay Latin-digit and Excel-readable. That
constraint is now written on the function — Persian digits do not survive a
round trip through a form field, which is what `toFormAmount` is for.

**Two API gaps the audit surfaced,** both of which had left the client no way to
be correct and are now fixed:

- `CreditEntity` carried only `credit_base_symbol_id` and `collateral_symbol_id`
  as raw columns with no relation, so the `creditBaseSymbol` / `collateralSymbol`
  that `CreditDto` documents were never populated. Both are now `ManyToOne` on
  the existing columns and loaded on the admin list, the per-user list and the
  active-credit lookup; `getCreditOverview` names them explicitly since it
  hand-builds its projection.
- `SettlementEligibility` reported `netEquity`, `deficit`, `shortfall` and
  `collateralValue` "in the credit currency" without naming that currency. It
  now carries `creditBaseSymbolSlug`, matching the per-row `baseSymbolSlug` the
  same response already had.

The general lesson: **a money field that does not travel with its symbol is a
bug in the API, not in the panel.** Where the audit found the panel guessing, the
fix belonged on the wire.

**Two rules that make the audit safe to continue:**

1. **Display and input convert together, per screen.** Converting a display
   without its form is worse than converting neither: the operator reads toman,
   types toman, and the form posts it as rial — a tenth of what they intended.
   The bank-accounts form is the worked example.

   `lib/money` now carries the form side of this so a screen cannot drift:
   `unitLabel(slug)` for the label, `toFormAmount` to seed the field,
   `toApiAmount` to submit. If a form displays a converted amount, all three
   belong on it.
2. **Format through the symbol wherever it is in scope.** `fmtBySymbol` divides
   a rial balance and leaves a gold balance in grams. A bare `fmtToman` on a
   column that can hold either is a bug waiting for the first non-rial row.

Four pages define their own local `fmtNum`, which is why there is no single
choke point today. Removing those shadows as each page is audited is what makes
the next audit cheaper than this one.

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


## 7. Market ticker — implemented

`src/components/MarketTicker.tsx`, mounted as the first child of `.app-shell`
so the strip spans the full width above both the sidebar and the main pane,
matching where ui-parszargar puts it. `.app-shell` gained a
`grid-template-rows: auto 1fr`, which keeps the shell at exactly the viewport
height so only `.main` scrolls — the ticker must not scroll away with the
content.

It polls `GET /admin/market/ticker` every 3s, the cadence the endpoint
advertises and the reference panel uses. It renders `sellPrice` through
`fmtBySymbol`, so a rial quote becomes toman in Persian digits like every other
amount, and an instrument with no live quote shows an em dash and a stale mark
rather than a zero. While the query is loading or failing the component returns
null: the strip is ambient context, and a permanently empty marquee or an error
an operator cannot act on is worse than no strip.

Direction arrows are derived by remembering the previous poll, because the API
sends no `change` field — it keeps no history to send. Two cases deliberately
show no arrow: the first value seen, and a price that has gone null because its
quote dropped out. Reading the latter as a fall to zero would paint the whole
strip red the moment a feed hiccups.

The decisions live in `src/lib/ticker.ts` — `directionOf`, `isGoldCategory`,
`marqueeDuration` — rather than in the component, so they are covered by the
`node`-environment vitest suite without pulling in a DOM stack the panel does
not otherwise have. The JSX left behind holds no logic worth testing.

Verified by rendering the built panel headlessly against a stub API: the strip
is 38px like the reference, the grid rows come out `38px` + the remainder, the
track is RTL with a 2.5s-per-item duration and two sets for a seamless loop,
92,800,000 rial renders as `۹٬۲۸۰٬۰۰۰ تومان`, and a null-priced instrument
renders as `— ⧗`.


## 8. Reports — implemented

`src/pages/ReportsPage.tsx` at `/reports`, under مدیریت in the sidebar.

Four clickable KPI cards over `GET /admin/reports/stats`, each selecting a view
of the same list (`generated`, `schedules`, `downloads`, `duration`); a
generator form; the report list; and a schedules table with create, edit and
delete.

**Generating is a poll, not a wait.** `POST /generate` returns a queued job, so
the list refetches every 3s *only while* something is `pending` or `running`
and stops on its own once everything has settled — a fixed interval would poll
a quiet desk forever.

**The download URL is minted per click.** It expires in about two minutes, so a
link rendered at page load would be dead by the time anyone pressed it. The
button fetches `/:id/download` and follows the returned URL, which is
bearer-free by design. A job whose artefact has been purged shows «منقضی شده»
in place of the button rather than offering a download that would fail — the
row survives as the audit record, the file does not.

The type select offers only the four the API has, and the format select only
Excel and CSV. Both omissions are the API's, for reasons recorded in
`PARSZARGAR-ADMIN-API-PLAN.md` §5.23; the form says so in a line under it
rather than leaving an operator to wonder where PDF went.

A schedule's type is disabled when editing, matching the API's refusal to
change it, with a line saying why.

Date inputs use the shared Jalali `DateField` (§9), like every other date in
the panel.

Verified by rendering the built panel headlessly against a stub API: the KPI
cards read in Persian digits, the four report rows render their status,
schedule origin and inline failure message, the expired row offers no download,
and the schedules table shows cron expressions LTR inside the RTL layout. The
range column was cut to dates only after the first render showed the download
button pushed off the edge — a report window is day-granular anyway, so two
full timestamps were both wider and more precise than the truth.


## 9. Jalali date fields

`src/components/DateField.tsx` replaced all ten native `type="date"` and
`type="datetime-local"` inputs, across Reports, Finance, Finance logs, Users,
Warehouse, Levels and Discounts. `react-multi-date-picker` with the Persian
calendar, matching ui-parszargar, which uses the same library.

**The panel displays Jalali and sends Gregorian**, exactly as it displays toman
and sends rial. `value` and `onChange` carry the same
`YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` strings the native inputs carried, so no call
site and no API changed — only the glyphs an operator reads. That is the whole
point of the component: the calendar is a display concern and must not reach
the wire.

The conversion lives in `lib/dates.ts` behind its own tests rather than inline
in the component, because the failure mode is silent. `toWireDate` builds the
string from the date's own local parts instead of `toISOString()`, which would
shift a picked day *backwards* for any timezone east of UTC — Tehran included —
and `fromWireDate` parses `YYYY-MM-DD` as local midnight rather than letting
`new Date()` read it as UTC, which is the same off-by-one in the other
direction. A report window quietly moved back a day is invisible until someone
reconciles an export against the database, so both directions are pinned by
round-trip tests.

Two details worth keeping: time is a **plugin** in this library's v4, not a
prop, so a `timePicker` prop would have been accepted silently and the field
would have dropped the time; and the library's own `.rmdp-wrapper` rule is
emitted after `index.css`, so the dark theme needs one extra specificity step
(`:root .rmdp-wrapper`) rather than `!important` to win the cascade.

`react-date-object` is pinned as a direct dependency even though the picker
pulls it in transitively, because the component imports the calendar and locale
from it directly and a transitive version bump should not be able to break
that.

Verified by driving the built panel headlessly: the calendar renders Jalali
(`شهریور، ۱۴۰۵`, Persian weekday names) on the panel's dark tokens, the field
shows `۱۴۰۵/۰۶/۱۵`, and the request that follows carries
`from=2026-09-06T00:00:00.000Z` — the correct Gregorian instant, no off-by-one.
The datetime variant renders the time plugin with hour and minute segments and
shows `۱۴۰۵/۰۶/۱۰ ۱۹:۱۸`.
