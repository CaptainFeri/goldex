# Price engine

The desk's price screen: what the platform can price, what those prices have
done, whether each market is open, and which feeds are on.

Base path `/api/v1/admin/price`. Every route requires the `price_engine`
permission — the market ticker deliberately requires none (it renders in the
panel chrome on every page), but this screen closes markets and turns price
feeds off, and those are decisions.

Prices are **rial**, like everywhere else on this API. The panels divide by ten
and label it toman; nothing here converts. See
`docs/PARSZARGAR-ADMIN-API-PLAN.md` §3.1.

## Endpoints

| | |
| --- | --- |
| `GET /admin/price/instruments?category=&search=` | the catalogue, grouped |
| `GET /admin/price/history?symbols=&points=&hours=&providerKey=` | recorded prices on one grid |
| `PATCH /admin/price/instruments/:id/market-status` | force a market open or closed |
| `GET \| PATCH /admin/price/engine-config` | sources, spread state, refresh cadence |

## There is one price path, not two

Prices come from `MarketService`'s live cache — the same cache the websocket
`prices` room and the market ticker read. Nothing here reads a price a second
time. A second price path would eventually disagree with the first, and the
ticker, the socket and this screen would show different numbers for the same
instrument.

The same rule applies to open/closed: `MarketStatusService` owns it. The PATCH
delegates to `setOverrideForPair`, because **closing a pool cancels the orders
resting in it** and that has to keep happening whichever screen the operator
closed it from.

The one deliberate exception is the *read* of market status. `instruments` reads
`pair_pool_status` rows directly instead of calling `MarketStatusService.getAll()`,
which rebuilds the bridge-route graph for every pair on the install — this
endpoint is polled every few seconds. The rows are maintained by that service's
30-second sweep and by every price update, so they lag by at most one sweep.

## The catalogue is the symbol table

The plan asks for "60+ instruments seeded from `data/priceInstruments.js` into
`admin-symbol`". **They must not be seeded**, for the reason migration 094
already records:

> `admin-user.service.ts` generates a zero-balance wallet per active symbol for
> every user it creates, and `credit.service.ts` enumerates active material
> symbols when opening a facility.

Sixty display-only symbols would mean sixty junk wallets per customer, forever,
and would leak into the credit machinery. An instrument also needs a pair and a
provider mapping before it has a price at all, so the seeded rows would render
as a permanent grid of blanks.

So an instrument is a symbol that genuinely exists. Everything except the rial
symbol itself is listed — `IRR` is the unit the rest are quoted in, and
`IRR/IRR` is not a pair. Instruments with no `category` are grouped under
`سایر` rather than dropped, so a half-configured symbol is visible as such.
Categories appear in the order their first instrument does, so `display_order`
drives both levels of grouping instead of the desk getting an alphabetical
order it cannot influence.

An instrument with no rial pair comes back with null prices, a null
`quoteSlug`, and `marketOpen: null` — present and visibly unconfigured, not
missing.

## Colour

`symbol.color` is new, nullable, and validated as a CSS hex string on the way
in. Unset, the endpoints derive a stable hue from the slug: a chart needs a
stroke, and a series whose colour changed between two polls reads as a
different series. `colorConfigured` says which of the two a client got.

Migration 103 seeds four colours — XAU, USD, EUR, AED — read off the reference
list, and only where the match is by identity rather than by guess (its entry
is literally «انس طلا (XAU)»). Everything else derives.

## History is real, or it is null

`price_pair_histories` is written whenever a provider reports, which is neither
regular nor aligned between pairs — one instrument may record forty rows in an
hour and another two. Charting those side by side by row index would put a gold
price from 09:04 next to a dollar price from 06:00 and call them the same point
on the x axis.

So the window is cut into `points` equal buckets across the last `hours`, and
every series is placed on that one grid. Each bucket carries its most recent
report; the aggregation happens in Postgres, because a busy pair records
thousands of prices a day and only `points` of them survive.

Two rules about gaps:

- A bucket with no report of its own **carries the last one before it**. A price
  that has not been reported since 09:00 is still the price at 09:30; a gap in
  the feed is not a drop to zero, and drawing it as one is how a chart lies.
- A bucket before an instrument's first recorded price is **null**, never zero.
  The chart is seeded with the last price recorded *before* the window, so a
  quiet instrument opens on a line rather than on empty space — but where there
  is genuinely no price, the client gets null and can render a gap.

The reference screen synthesised its chart from a sine wave. Nothing here does:
an operator cannot tell a synthetic line from a real one once it is drawn.

`symbols` takes **slugs**, comma-separated, at most 25. Rows are keyed
`<slug>_buy` / `<slug>_sell`, and `series[]` publishes those key names so a
client need not build them. A slug that cannot be charted comes back in
`missing[]` with a reason — `unknown-symbol` or `no-pair` — rather than
silently thinning the chart.

## Market status

`PATCH /admin/price/instruments/:id/market-status` takes `{ open }`:

| `open` | effect |
| --- | --- |
| `true` | admin override → OPEN on every pool of the instrument's rial pair |
| `false` | admin override → CLOSED, **cancelling the orders resting in those pools** |
| `null` | clears the override; the pools return to automatic derivation |

`null` is the only way back to derivation once an override is set, which is why
it is accepted rather than the field being required. An instrument with no pair
is a 400, not a silent no-op.

Confirm-gated in the panel, not OTP-gated: the operation-OTP scopes are money
paths and irreversible changes, and this is reversible by the toggle that made
it.

## Engine config

```
{ sources: [...], autoSpread: {...}, refreshIntervalSec, updateAt }
```

**`sources` are the `provider` rows**, not a copy of them. The pricing engine
owns providers; this backend mirrors them and toggles one by publishing a
command on the queue. So the toggle here is the same flag the providers screen
shows, and turning a source off on one screen turns it off on the other.
`ProviderService.setActiveByKey` is the idempotent counterpart of
`toggleActive`: a source already in the requested state is left alone, because
the engine command is a *toggle* on its side too and re-publishing it would flip
the thing the call was asked to leave alone. Unknown keys are rejected before
any source is applied — half a config change is worse than none, because
nothing on the screen would say which half landed.

**`refreshIntervalSec` is the client cadence** — how often a panel should poll —
not the engine's fetch interval. The engine's own loop is configured per
provider (`provider.metadata_refresh_interval_ms`) and is not reachable from
here; claiming otherwise would be a lie an operator could not see through.
Stored on `price_engine_config`, a one-row table enforced by a unique index on
a column that is always true, exactly like `platform_settings`.

**`autoSpread` is derived and read-only.** The reference screen shows it as a
switch, and it must not be one here. The "spread" in this platform is the pair's
`buyCommission` / `sellCommission` and the symbol's `gain`; `MarketService`
applies them to produce the display prices, and `wallet-order.service` books the
difference as the platform's profit. A global switch would zero the desk's
margin on every quote in one click, and there is no code path that restores it.

So the endpoint reports what is true — whether any pair carries a commission and
whether any symbol carries a gain — and says where to change it:

```json
{ "enabled": true, "pairsWithCommission": 4, "symbolsWithGain": 2, "writable": false }
```

`PATCH` accepts `autoSpread` **only when it matches the current derived value**,
so a client can send the whole config object back unchanged. Any other value is
a 400 (`PRICE.AUTO_SPREAD_NOT_WRITABLE`).

## Tests

| | |
| --- | --- |
| `history-buckets.spec.ts` | window arithmetic, carry-forward, slug parsing |
| `instrument-color.spec.ts` | hex validation, determinism, the fallback |
| `admin-price.service.spec.ts` | grouping, filters, staleness, overrides, the config rules |
| `admin-price.controller.spec.ts` | `price_engine` on every route, body and param validation |
| `admin-price.db.spec.ts` | the SQL — bucketing, the `DISTINCT ON` seed, the pair relation filter, the spread counters (`GOLDEX_DB_SPECS=1`) |

The database spec is where the raw SQL is actually checked. A mocked repository
would have agreed with any of it being wrong.
