# API keys

Issue, limit, revoke and delete keys, and see what traffic they generate.
Everything here is behind the `api` permission, which by seed only the root
role holds — these keys authenticate as the platform.

## The gap you will hit first

**Nothing in this codebase currently accepts an API key.** Every route is
behind either operator authentication (`AdminAuthGuard`) or user
authentication (`UserAuthGuard`); there is no partner or public surface. Keys
can be issued and managed, and the traffic they generate will be recorded —
but until a route opts in, that traffic is zero.

This is reported rather than hidden. `GET /admin/api/stats` returns
`keyedRouteCount`, and the panel uses it to say so in words instead of showing
four zeros that look like a broken dashboard.

Deciding which endpoints third parties may call is a product and security
decision, not a mechanical one, which is why this change does not make that
choice. When it is made, opting a route in is one decorator:

```ts
import { ApiKeyAuth } from "../api-keys/guard/api-key-auth.decorator";

@ApiKeyAuth()          // registers the route, applies the guard, documents the header
@Get("rates")
async rates() { /* … */ }
```

The route's module needs `ApiKeyModule` imported, and the usage interceptor
applied (`@UseInterceptors(ApiKeyUsageInterceptor)`) for its traffic to be
counted. Without the interceptor the key still authenticates; it just does not
show up in the figures.

## Storage

Keys are `gx_live_` followed by 32 CSPRNG bytes as hex, and only a **SHA-256**
digest is stored.

The plan suggested bcrypt, since it is already a dependency. That is the wrong
tool here: bcrypt is deliberately slow, and this hash is verified on *every API
request* — it would add roughly 100 ms to each one. bcrypt's slowness exists to
defeat dictionary attacks against low-entropy human passwords. These keys are
256 bits of randomness, where there is no dictionary to attack, so a single
uniquely-indexed SHA-256 lookup is both faster and the standard choice.

The plaintext is returned by the create response and never again. The panel
shows it once and says so; there is no endpoint that can reveal it later.

## Status

| Status | Meaning |
| --- | --- |
| `active` | Authenticates normally. |
| `limited` | Authenticates until `monthlyQuota` requests this calendar month, then 429. |
| `revoked` | Refused, answered identically to an unknown key so a caller cannot probe for which keys once existed. |

`limited` requires a quota — the service refuses to set it without one. A
"limited" key with no cap would authenticate exactly like an active one while
reading as a restriction in the UI, which is the sort of thing nobody notices
until it matters.

Deleting a key is a soft delete: the traffic it already generated is still
traffic that happened, and the usage rows reference it.

## Usage recording

Counters per key per hour, not a row per request — the chart needs 24 points
and the stats need sums, and neither needs individual requests. Recording is an
`INSERT … ON CONFLICT DO UPDATE` against the unique index on
`(api_key_id, bucket)`.

**That index is load-bearing.** It is what makes the upsert atomic; without it
concurrent requests in the same hour each insert their own row and the counts
split. This was verified by dropping the index and watching 40 concurrent
requests fail loudly rather than quietly miscount.

The recorder never propagates its own failures into the response — telemetry
must not break the request it is measuring.

## Reading the figures

`avgResponseMs`, `successPercent` and `errorPercent` are **null** when there
was no traffic, not `0` and not `100`. A success rate of 100% over zero
requests reads as healthy and would be acted on. A rate of exactly `0` is a
different thing and is reported as `0`.

`GET /admin/api/traffic` emits every hour in the window including empty ones,
so the chart shows the real shape of the traffic rather than silently dropping
quiet hours.
