# Shahin (bank rails) — admin surface

`/admin/shahin/*`. Reading needs `accounting`; moving money needs `wallets_ops`
**and** an operation OTP.

## Security fix: read this before deploying

Three routes on the old proxy were behind `UserAuthGuard`:

```
POST /api/shahin/request-transfer
POST /api/shahin/transfer
POST /api/shahin/batch-transfer
```

Any authenticated **customer** could call `request-transfer`, receive an OTP on
**their own phone**, and pass it to `transfer` — whose body (`dto: any`: source
account, destination, amount) was forwarded to the bank unvalidated, with the
company's API key attached.

`POST /api/shahin/account/balance` and `/account/statement` had the same guard,
exposing the company's balances and transaction history to any signed-in
customer.

### What changed

- **The three transfer routes are removed**, not re-gated. Keeping a second,
  differently authorised path to the same bank rail is how the first one went
  unnoticed for as long as it did.
- The two read routes are now `AdminAuthGuard` + `accounting`, and marked
  deprecated in favour of the new admin ones. Existing callers get a clear 403.
- The in-memory OTP map that "protected" the transfers is deleted with them. It
  was a `Map` on one process — it did not survive a restart, did not work
  across replicas, and authorised a company bank transfer with a code sent to
  the requester's own phone.

**If any client outside this repository calls those transfer routes, it will
break.** That is the intended outcome; nothing legitimate should have been
calling them.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/shahin/accounts` | `accounting` |
| GET | `/admin/shahin/accounts/:id` | `accounting` |
| GET | `/admin/shahin/accounts/:id/balance` | `accounting` |
| GET | `/admin/shahin/accounts/:id/statement` | `accounting` |
| GET | `/admin/shahin/statement/export` | `accounting` |
| GET | `/admin/shahin/open-banking` | `accounting` |
| POST | `/admin/shahin/open-banking/:id/sync` | `accounting` |
| POST | `/admin/shahin/accounts/inquiry` | `wallets_ops` |
| POST | `/admin/shahin/transfer` | `wallets_ops` + OTP |
| POST | `/admin/shahin/batch-transfer` | `wallets_ops` + OTP |

Seeing the balances is not authority to move the money — that is why the read
and write permissions differ.

`/accounts/inquiry` is declared **before** `/accounts/:id`, which is behind a
`ParseIntPipe`. The other order answers an inquiry with a 400 about a malformed
id; there is a test for it.

## One upstream client

Forwarding moved out of `ShahinProxyController` into
`ShahinPersistenceService.forward()`, which both surfaces now use. Two clients
to the same bank would eventually disagree about error shapes and about which
calls reach the entry log. The controller went from ~750 lines to ~300 with no
route changes.

## The second factor

`POST /admin/shahin/transfer` carries `@RequireOperationOtp(SHAHIN_TRANSFER)`.
The challenge is bound to `sourceAccount`, `destinationAccount` and `amount`
(see `docs/OPERATION-OTP.md`), so a code issued for one amount cannot be spent
on another. The confirmation fields are stripped before the request reaches the
bank.

The batch route uses the `withdraw.bulk` scope with `refIds` covering the
destination set: adding a destination after the code was issued invalidates it.

**Amounts are rial on the wire.** The panel takes toman and converts *before*
hashing — get that backwards and the OTP faithfully confirms ten times the
intended transfer.

## What is not invented

The bank is inconsistent, and where it is silent nothing is guessed:

- A balance it did not return is `null`, not `0`.
- A statement row's direction falls back to the sign of the amount only when
  the bank stated none, and is `null` when even that is unavailable. A wrong
  direction on a bank statement is worse than an empty cell.
- The statement parser knows four response shapes (`respObject.transactions`,
  `.items`, `.records`, and a bare array) and several field spellings, in one
  place, and returns `[]` for anything else rather than throwing.
- `trackNo`, `minAmount` and `maxAmount` are applied **by us** — the bank
  filters only by date. That means they filter the page the bank returned, so a
  narrow amount filter over a long range can miss rows on later pages.
- Open banking has **no upstream endpoint**. `connected` is whether the last
  recorded call for that account succeeded; `accessScope` and
  `consentExpiresAt` are `null` unless the bank supplied them in the account
  metadata. A fabricated consent expiry on a banking screen is worse than an
  empty field. `sync` re-asks for the balance, which is what sync can honestly
  mean here.

## Not done

- `GET /api/shahin/accounts`, `/entries` and friends on the old proxy still
  carry the inert `@AdminRoles` decorator rather than `@RequirePermissions`, so
  they are reachable by any authenticated admin. They are reads of the same
  data the new surface exposes properly; folding them in is a follow-up (see
  `docs/ADMIN-RBAC.md`).
- Statement paging is passed to the bank but not surfaced in the panel, which
  shows the first page.
- The batch-transfer endpoint exists and is tested, but has no panel screen.
