# Operation OTP

A 60-second second factor on the mutations that move money.
`POST /admin/operations/otp` issues; the action endpoint consumes.

## The property that matters

A code is bound to **one operation**, not just to an operator. A code issued to
move 5,000,000 cannot be spent moving 500,000,000.

That only holds because **the server derives the binding from the request it is
authorising**, never from the client's account of it:

1. The panel computes `payloadHash` over the scope's declared fields and asks
   for a code.
2. The action request arrives carrying `{ challengeId, otp }`.
3. The guard recomputes the hash **from the validated request body** and
   compares it to the one stored at issue.

Step 3 is the whole mechanism. If the server trusted a hash the client sent
alongside the action, a client could hash the small amount and submit the large
one.

## Canonical form

Because both sides must derive the same string, the canonical form is defined
narrowly — `JSON.stringify` is *not* canonical, since key order, whitespace and
number formatting all vary between producers.

`scope|refKey|field1=value1|field2=value2`, fields in the order the scope
declares, each value normalised:

| Input | Canonical |
| --- | --- |
| `5000000`, `"5000000"`, `"5000000.00"`, `"+5000000"`, `"5e6"`, `" 5000000 "` | `5000000` |
| `"1.500"` | `1.5` |
| `"-0"`, `"0.000"` | `0` |
| `null`, `undefined`, `""` | `""` (empty — and *not* the same as `0`) |
| `["b","a"]` | `a,b` (sorted) |

Two rules are doing real work here. Being too **loose** would let a code
approve a different amount. Being too **strict** would reject an honest client
whose JSON says `"5000000.00"` — which teaches operators the feature is broken
and gets it switched off. Large rial values are normalised by string
manipulation, never `Number()`, which would round exactly the amounts this
protects.

The `field=` prefixes are not decoration: without them `{a:"x|y", b:""}` and
`{a:"x", b:"y"}` canonicalise identically.

The panel mirrors this in `src/lib/operation-otp.ts`, and
`operation-otp.spec.ts` pins it to vectors generated from the server
implementation. **If you change one side, regenerate those vectors** — drift
shows up as every confirmation failing with `OTP.PAYLOAD_MISMATCH`.

## Storage and limits

Redis only; a challenge that outlives its minute is not worth keeping.

The key is `op_otp:{adminId}:{scope}:{refKey}` — derived from **who, what and
which record, never from the challenge id**. Consuming therefore has to arrive
at the same key from the request being authorised, so a code cannot be spent on
a different record, or by a different operator, even if its id leaks.

- **TTL 60s.** One live challenge per (admin, scope, record); while one lives,
  issuing answers `OTP.ALREADY_SENT:<seconds>` so the panel counts down instead
  of re-texting the operator.
- **3 attempts**, counted with `HINCRBY` *before* any check. A read-modify-write
  would let ten concurrent guesses each see zero attempts; there is a test that
  fires ten at once.
- A payload mismatch **costs an attempt**, or the amount could be probed freely.
- Success deletes the challenge. Single use, whatever the operation does next.
- A failed SMS deletes it too — otherwise the operator waits out a full minute
  for a code that never arrived.

## Dev bypass

`12345` is accepted only when **both** `NODE_ENV !== "production"` **and**
`GOLDEX_OTP_DEV_BYPASS=1`.

This is deliberately stricter than the admin login flow, which accepts `12345`
whenever `NODE_ENV` is not `"production"`. These are money operations: a
staging box that merely forgot to set `NODE_ENV` should not be bypassable.
Verify the variable is unset wherever it matters.

## Wiring an endpoint

```ts
@Post("vouchers/:id/finalize")
@RequireOperationOtp(OtpScope.ACCOUNTING_VOUCHER)
async finalizeVoucher(@Param("id") id: string, @Body() dto: FinalizeVoucherDto) { … }
```

1. Add the scope to `OtpScope` and a descriptor to `OTP_SCOPES` — `fields` is
   the contract the panel reads from `GET /admin/operations/otp/scopes`.
2. Mix `challengeId` / `otp` into the endpoint's DTO so they are validated
   rather than silently ignored.
3. Import `OperationOtpModule` in the endpoint's module.
4. Update the client **in the same change**.

> Point 4 is not optional. Applying the decorator is a **breaking change** for
> whatever already calls that endpoint: requests without a confirmation start
> failing with `OTP.CONFIRMATION_REQUIRED`.

Keep `fields` to what the operator is actually confirming. Hashing an
incidental field buys no safety and turns a harmless edit into a failed
confirmation.

## Status

| Scope | Endpoint | Wired |
| --- | --- | :---: |
| `accounting.voucher` | `POST /admin/accounting/vouchers/:id/finalize` | **yes** |
| `wallet.deposit` | `POST /admin/wallets/update-balance` | no |
| `wallet.withdraw` | `POST /admin/wallets/update-balance` | no |
| `withdraw.approve` | `POST /admin/withdraw/:id/approve` | no |
| `withdraw.reject` | `PATCH /admin/withdraw/:id/process` | no |
| `withdraw.bulk` | — (no bulk endpoint exists yet) | no |
| `shahin.transfer` | `POST /api/shahin/transfer` | no |
| `em.approve` | — (Withdrawal EM, §5.17, not built) | no |

Only the voucher path is wired, because that is the one whose panel screen was
updated in the same change. The descriptors for the rest are declared and
tested, but **confirm each `fields` list against the endpoint's actual DTO
before wiring it** — a field named here that the DTO does not carry hashes as
empty on both sides, which still verifies but binds nothing.

Rejecting a voucher stays ungated on purpose: it books nothing and is undone by
raising a new voucher, so a code per rejection would be friction without a
safety gain.

## Tests

Redis-level guarantees — the atomic attempt limit, the TTL, single use — run
against a real Redis:

```
GOLDEX_REDIS_SPECS=1 npx jest src/operation-otp
```

They skip by default. The canonical hashing, the guard's reference extraction
and the wired endpoint are covered by the ordinary suite.
