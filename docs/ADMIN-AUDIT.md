# Admin audit trail

Every admin mutation is recorded, by a **global** interceptor.

## Why global

The plan calls this "non-negotiable for the money paths". An audit trail that
controllers opt into records exactly the routes someone remembered to decorate,
which is not an audit trail — so `AdminAuditInterceptor` is registered through
`APP_INTERCEPTOR` and covers every route in the app.

What it records, and what it deliberately does not:

| | |
| --- | --- |
| POST / PUT / PATCH / DELETE on a route containing `/admin` | **recorded** |
| GET and everything else | skipped — the log is about what *changed* |
| non-admin routes | skipped — user mutations have their own trails |
| refusals and errors | **recorded**, with the status and message |
| `@SkipAudit()` | skipped, and to be used almost never |

Refusals matter as much as successes: "who tried to approve this and was told
no" is usually the more interesting question.

## Secrets never reach the log

The log stores request bodies, and those bodies carry OTP codes, passwords and
freshly minted API keys. **A log holding live credentials is worse than no
log** — it is a durable, widely-readable copy of the secrets it exists to
protect.

`redact.ts` applies a deny-list on *key names*:

```
otp | password | secret | token | api_key | plaintext | authorization | cookie | credential | passcode
```

Matched case-insensitively and as a substring, so `otpCode`, `userPassword` and
`API_KEY` all go. A key that matches is replaced whole — a nested object under
`credentials` is dropped rather than walked into.

It is a deny-list and not an allow-list on purpose: the log's value is in
recording *what changed* — amounts, accounts, notes — and an allow-list would
silently drop the fields a dispute turns on. Over-redaction is the other
failure mode, and it is tested for.

Also bounded, because bodies are not always small: strings cap at 2,000
characters, arrays at 50 entries (with a count of what was dropped), and
recursion at 6 levels, so a deep or cyclic body cannot hang the recorder.

`challengeId` is **kept** — it identifies which confirmation was spent and is
not itself a secret. It is also lifted into its own `otp_challenge_id` column.

## Fields

`action` and `entity` come from the matched route *pattern*, never the concrete
URL, so every call to one endpoint groups under one action instead of
fragmenting by id:

```
POST /api/v1/admin/accounting/vouchers/f3a1…/finalize
  action   = "POST /admin/accounting/vouchers/:id/finalize"
  entity   = "accounting/vouchers"
  entityId = "f3a1…"
```

`entity` is the literal segments up to the first path parameter, so nested
resources group under their parent (`em/requests`, `credits/settlements`).

`adminLabel` is denormalised, and there is **no foreign key to `admin`** — the
log must survive the deletion of the account it records, which is exactly the
case where it matters.

### `before` is opt-in, on purpose

An interceptor cannot know what a row looked like beforehand without fetching
it, and a *guessed* "before" in the record that settles a dispute is worse than
an absent one. Handlers that want it call:

```ts
this.audit.captureBefore(req, { status: voucher.status, amount: voucher.amount });
```

Nothing calls it yet. Adding it to the money paths is a sensible follow-up.

## Reading it

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/audit/logs` — filter by admin, entity, entityId, action, date, `failedOnly` | `monitoring` |
| GET | `/admin/audit/entity/:entity/:entityId` — everything about one record | `monitoring` |

**There is no write endpoint, and no update or delete anywhere in the module.**
A log the recorded parties can amend is not evidence of anything.

## Failure behaviour

`AdminAuditService.record` never throws. An operator retrying a refused
transfer because the audit insert timed out is worse than a gap in the log —
and the gap is visible in the log itself. Failures go to the Winston logger.

## Not done

- **Retention.** The table grows without bound. This is a deliberate omission:
  how long admin actions must be kept is a compliance question, not an
  engineering one. When it is answered, the purge belongs in the existing
  schedule module — and should archive rather than delete.
- **`before` snapshots** on the money paths, per above.
- **Idempotency keys** (§8) are not yet accepted anywhere, so a replayed
  mutation logs twice. Worth pairing with that work.
- The log is written on the same connection as the request. At the current
  volume that is fine; if admin write traffic grows, this is the thing to move
  behind a queue.
