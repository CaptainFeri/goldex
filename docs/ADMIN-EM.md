# Withdrawal EM

`/admin/em`. A **projection over `src/p2p`** — not a new module, not a second
source of truth.

## Why a projection

EM is the existing rial P2P settlement desk under a different name. Building it
as its own lifecycle would mean two places that believe they know where money
is, and they would disagree. So there is no `em_*` table: every row is derived
on read, and every action delegates.

| EM concept | `src/p2p` |
| --- | --- |
| Request row | `p2p_withdraw_request` (1:1 with `withdraw`) |
| نوع = برداشت | a `p2p_withdraw_request` |
| نوع = واریز | a `p2p_deposit_intent` |
| نوع = تسویه | a request whose matches have `source = ADMIN` |
| نوع = انتقال | **unmapped** — see below |
| فیش (N per request) | `p2p_payment_proof`, one per `p2p_match` |
| کاربر درخواست‌کننده | the withdrawer on the request |
| کاربر انجام‌دهنده | the depositor on the match |
| حساب مقصد | the withdrawer's IBAN, from `destination_snapshot_json` |
| «حساب داده شده» | `destination_bank_account_id` |
| زمان مانده تا انقضا | the earliest of the request's and its parts' deadlines |
| تأیید / رد | escalation resolutions `CONFIRM_PAYMENT` / `REJECT_PAYMENT` |

## The status mapping is one function

`em-status.ts` holds the four statuses as pure functions over the P2P state
machines. It is deliberately not a `CASE` expression: written that way it gets
copied into each handler that needs it, and the copies drift until two screens
disagree about what a request is waiting for.

| EM status | Derived from |
| --- | --- |
| در انتظار دریافت حساب | `PENDING_MATCHING`, or `ADMIN_SETTLEMENT` **before** an account is assigned |
| در انتظار دریافت فیش | part `RESERVED`/`PAID_PENDING`, or match `RESERVED`/`AWAITING_PAYMENT`; also `ADMIN_SETTLEMENT` once an account *is* assigned |
| فیش پرداخت‌شده | match `PROOF_SUBMITTED` / `WAITING_CONFIRMATION` / `CONFIRMED` |
| رد شده | match `REJECTED_BY_WITHDRAWER`, or an escalation resolved as reject/cancel |
| بسته‌شده | completed, expired, cancelled, draft |

Two edges worth knowing, both tested:

- **A partly paid request reports as paid, not as waiting.** One part reserved
  and another confirmed means a receipt *has* arrived; grouping it under
  "awaiting receipt" makes the desk chase a payment that was made.
- **A rejection outranks everything**, including a confirmed match on the same
  request and a `COMPLETED` state.

The deposit-intent switch is exhaustive over the enum on purpose — adding an
intent state is a compile error here, not a silent "closed".

## Actions delegate, always

| Action | Goes through |
| --- | --- |
| approve / reject | `P2pEscalationService.resolve` |
| assign account | `AdminBankAccountService.findById`, then the request row |
| enclosure flag | the request row (display only) |

`P2pEscalationService.resolve` owns the audit log, the **two-person control on
amounts above the configured threshold**, and the settlement invariants.
Writing `p2p_*` from the EM service would route around all three — which is why
nothing here does.

**With no open escalation, a decision is refused** (`EM.NO_OPEN_ESCALATION`)
rather than fabricating a state change outside the audited path. The panel
hides the buttons and says so instead of offering an action the server rejects.

A large-amount approval may be *staged* for a second admin rather than applied.
That refusal comes back from the escalation service and is shown as-is; the EM
layer does not interpret it.

## Permissions and the second factor

- Watching the desk: `withdrawals_view`.
- Deciding: `withdrawals_approve` **plus** an operation OTP (`em.approve`)
  bound to the request id.
- Assigning an account and setting the enclosure flag need
  `withdrawals_approve` but **no OTP**: one names an account, the other is a
  display field. Neither moves money.

## Two things the P2P model does not answer

- **`hasLef` (دارای لف).** Nothing in `src/p2p` corresponds. Stored as
  `p2p_withdraw_request.has_enclosure`, operator-set, display only — no
  settlement logic reads it. **The plan flags this as worth confirming with
  whoever specified the column, and that confirmation has not happened.** If it
  turns out to mean something derivable, this column should go.
- **نوع = انتقال.** The plan maps it to "an `admin_bank_account` transfer leg",
  but no such row exists in `src/p2p` — those transfers live on the Shahin
  rail. `EmRequestType.TRANSFER` is declared so the client never renders
  `undefined`, and **nothing ever projects a row with it**. Wiring it would mean
  joining the Shahin entry log into this view, which is a different change.

## Expiry

Served as a timestamp, and as the **earliest** deadline that actually applies
across the request and its reserved parts — otherwise the desk counts down to a
deadline that is not the binding one. The countdown is rendered client-side;
the plan calls out the mock's pre-rendered "۳ ساعت" strings as going stale in
an open tab.

## Not built

- **Receipt upload** (`POST /requests/:id/receipts`). A request fans out to N
  matches and a proof belongs to exactly one, so a request-level upload has no
  unambiguous target. The depositor's own upload already exists on the user
  side, and an admin paying on the company's behalf goes through
  `SETTLE_FROM_ADMIN`. Wiring it needs a decision about which match an
  admin-uploaded receipt attaches to.
- **`GET /admin/em/providers`.** The plan maps it to
  `admin/provider-finance/overview`, which already exists and returns exactly
  that. No alias was added: a second path to the same data is the thing that
  drifts.
- Paging on the projection happens **after** the rows are read and filtered,
  because the status a row is filtered on does not exist in either table. That
  is fine at the desk's current size and will not be at ten times it — the fix
  is a materialised status column, and it is not free.
