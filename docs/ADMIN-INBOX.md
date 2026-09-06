# Operator inbox

Durable, per-operator notifications for the admin panel:
`GET/PATCH /admin/notifications/inbox/*`.

## What was wrong before

Admin alerts existed **only** as websocket broadcasts. Three listeners called
`AdminNotificationGateway.sendToAdmins(...)` and that was the entire delivery
mechanism. So:

- An operator not connected at that moment never learned the event happened.
- There was no history — nothing to catch up on after a shift change.
- The panel's badge was a counter incremented per message, starting at zero on
  every page load. It showed how many alerts arrived while that tab was open,
  not how many were waiting, and reading them never cleared it.

The inbox stores the item first and broadcasts second, so the live feed is an
optimisation rather than the only delivery path.

## Path: not what the plan said, deliberately

The plan specified `GET /admin/notifications/stats` and
`PATCH /admin/notifications/:id/read`. **`GET /admin/notifications/stats`
already exists** and means "delivery stats for messages sent to users" — a
different question entirely. Taking that path would have shadowed a working
endpoint.

Everything is therefore mounted one level down, at
`admin/notifications/inbox`. `notifications-prefix-routing.spec.ts` mounts both
controllers together and fails if the inbox is moved back up.

| Method | Path |
| --- | --- |
| GET | `/admin/notifications/inbox` — paged, `unreadOnly`, `category`, `severity` |
| GET | `/admin/notifications/inbox/unread-count` |
| GET | `/admin/notifications/inbox/stats` |
| PATCH | `/admin/notifications/inbox/:id/read` |
| PATCH | `/admin/notifications/inbox/read-all` |

## Model

Items are **broadcast to the team**, not addressed to one person — so
`admin_notifications` has no `admin_id`. Who has read what lives in
`admin_notification_reads`, keyed `(notification_id, admin_id)` with a unique
index.

That split is load-bearing twice over. Storing `read_at` on the notification
would let one operator clear the badge for everybody; and the unique index is
what makes "mark read" idempotent via `ON CONFLICT DO NOTHING`.

### Permission scoping

An item may carry a `required_permission`. Only admins holding that key see it,
count it, or can mark it read. A warehouse operator does not need withdrawal
approvals in their inbox — an inbox full of things you cannot act on stops
being read at all.

Marking an item you cannot see answers **404, not 403**, so the response does
not confirm that an item you have no access to exists.

Reading your own inbox needs no permission; every operator has one.

> The empty case matters: an admin with no role holds no permissions, and
> `required_permission IN (:...held)` with an empty array is **invalid SQL**.
> The service branches to "unrestricted items only" before building that
> clause. Removing the branch is a syntax error at runtime, not a subtle
> mis-filter — there is a test that asserts exactly this.

## Categories and severity

Categories are `withdrawal`, `deposit`, `kyc`, `arbitrage`, `user`, `system`,
matching the UI's icon map. They are deliberately **not** the existing
`NotificationCategoryEnum`, which describes messages sent *to users* (TRADE,
PROMOTION, SUPPORT…). Sharing one enum would force each side to carry values
the other has no meaning for.

Severity is `info` / `warning` / `urgent`; `urgent` is what the stats count.

## Publishing

```ts
await this.inbox.publish(
  {
    event: "withdraw.created",
    category: InboxCategory.WITHDRAWAL,
    severity: InboxSeverity.INFO,
    title: "درخواست برداشت جدید",
    body: "یک درخواست برداشت ثبت شد و در انتظار بررسی است.",
    metadata: { withdrawId: id, amount, link: "/withdraws" },
    requiredPermission: "withdrawals_view",
  },
  this.gateway,
);
```

**Amounts belong in `metadata`, in rial — never in `body`.** The old broadcast
wrote `مبلغ ${amount}` into the sentence: a bare, unformatted rial figure with
no unit, in a panel that displays toman. Prose cannot be converted at render
time; a metadata field can.

`metadata.link` must be an in-app path. The panel refuses anything else,
including protocol-relative `//host` URLs, which would otherwise navigate an
operator off the panel from inside what looks like a system alert.

A failing broadcast never fails the publish — the item is already stored, which
is the whole point.

## Realtime is reported, not assumed

`stats` returns `realtimeEnabled` and `connectedAdmins` from the gateway. When
the feed is down the panel says updates arrive on refresh, rather than leaving
a quiet list to imply live data. The badge also polls on a slow interval so it
is right even when the socket never connected.

## Tests

Most of this module's behaviour *is* SQL — the per-caller read join, the
idempotent upsert, the permission filter. A faked repository would assert the
shape of the mock rather than any of it, so those run against a real database:

```
GOLDEX_DB_SPECS=1 npx jest src/admin-inbox/admin-inbox.db.spec.ts
```

They skip by default, since nothing else in the suite needs a database. Routing,
query coercion and validation are covered by the ordinary specs.

## Not built

- **Retention.** The table grows without bound. A purge of read items older
  than some window belongs in the existing schedule module; decide the window
  before writing it.
- Only three events publish today (deposit created, withdraw created, p2p
  escalation) — the three that already had broadcasts. KYC, arbitrage and user
  categories exist in the enum and render correctly, but nothing raises them
  yet.
