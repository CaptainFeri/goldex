# Credit Trading / Leveraged Collateral — Engineering Handoff

**Document type:** Engineering Handoff / Technical Specification  
**Version:** 0.1  
**Date:** 2026-08-22  
**Status:** Draft for engineering review

---

## 1. Executive Summary

The platform allows a user to freeze an eligible asset (initially Gold 750) as collateral and receive a configurable leveraged trading facility.

Example:

- User freezes **100g Gold 750**
- Current collateral value = **V**
- Approved leverage = **10x**
- Maximum credit exposure = **V × 10**
- The user trades only inside a dedicated **Credit Wallet / Obligation Wallet**
- Open positions are continuously marked to market
- Unrealized PnL, equity, margin ratio, settlement deadlines, and liquidation conditions are continuously evaluated
- If risk thresholds are breached, the system enters warning, margin-call, reduce-only, or liquidation states
- At settlement, the credit position is settled and eligible assets are transferred between the Credit Wallet and Cash Wallet
- If liquidation causes a loss, the loss is deducted from frozen collateral according to the platform's bad-debt policy

The recommended architecture is:

**Credit Trading Engine + Risk Engine + Settlement Engine + Liquidation Engine + Double-Entry Ledger**

---

# 2. Core Design Principles

## 2.1 Ledger is the source of truth

Balances must not be the authoritative accounting record.

Every financial movement must create a ledger transaction with balanced debit/credit entries.

Wallet balances are projections/caches derived from the ledger.

## 2.2 Credit Wallet is separate from Cash Wallet

The user must have separate accounting domains:

### Cash Wallet
- Real user funds
- Withdrawable assets
- Normal spot balances

### Credit Wallet
- Credit positions
- Negative counter-asset balances where permitted
- Unrealized/realized PnL
- Credit obligations

### Collateral Wallet
- Frozen collateral
- Not withdrawable while encumbered

## 2.3 Risk state and settlement state are independent

Risk state:

```text
NORMAL
WARNING
MARGIN_CALL
REDUCING
LIQUIDATING
LIQUIDATED
SETTLED
DEFAULT
```

Settlement state:

```text
GREEN
YELLOW
RED
ADMIN_REVIEW
AUTO_LIQUIDATION
SETTLED
```

A position can be financially healthy but close to its settlement deadline, or financially risky while still having settlement time remaining.

## 2.4 Liquidation creates a new order

Never modify the user's original order into a liquidation order.

A liquidation must create an independent:

```text
order_type = LIQUIDATION
source = LIQUIDATION_ENGINE
```

with its own audit trail and transaction ID.

## 2.5 All critical operations are idempotent

Operations such as liquidation, settlement, collateral freeze, and wallet transfer must use idempotency keys.

Example:

```text
LIQUIDATION:{position_id}:{liquidation_version}
```

---

# 3. High-Level Architecture

```text
                         Market Data
                             |
                             v
                    +-----------------+
                    |  Price Engine   |
                    +--------+--------+
                             |
                             v
+-------------+       +-----------------+
| Order Engine| ----> |   Risk Engine   |
+------+------+       +--------+--------+
       |                       |
       v                       v
+-------------+        +---------------+
|  Position   |        | Margin Engine |
|   Engine    |        +-------+-------+
+------+------+                |
       |                       v
       |               +---------------+
       +-------------->| Liquidation   |
                       |    Engine     |
                       +-------+-------+
                               |
                               v
                       +---------------+
                       | Ledger Engine  |
                       +-------+-------+
                               |
                 +-------------+-------------+
                 v                           v
          Credit Wallet                Cash Wallet
```

Recommended infrastructure:

- PostgreSQL for transactional data
- Kafka or RabbitMQ for asynchronous events
- Redis optionally for low-latency projections/locks
- Background workers for risk and settlement processing

---

# 4. Database Model

Recommended main tables:

```text
users
accounts
wallets
wallet_balances
collaterals
credit_facilities
credit_positions
orders
trades
ledger_transactions
ledger_entries
margin_snapshots
liquidation_events
settlement_events
credit_state_changes
market_prices
admin_actions
audit_logs
credit_policies
```

---

# 5. users

```sql
users
---------
id                  UUID PK
external_id         VARCHAR UNIQUE
status              VARCHAR
credit_enabled      BOOLEAN
created_at          TIMESTAMP
updated_at          TIMESTAMP
```

Statuses:

```text
ACTIVE
SUSPENDED
BLOCKED
CLOSED
```

`credit_enabled` is independent from user account status.

---

# 6. accounts

```sql
accounts
---------
id                  UUID PK
user_id             UUID FK
account_type        VARCHAR
status              VARCHAR
created_at          TIMESTAMP
```

Account types:

```text
CASH
CREDIT
COLLATERAL
```

---

# 7. wallets

```sql
wallets
---------
id                  UUID PK
account_id          UUID FK
wallet_type         VARCHAR
currency             VARCHAR
status              VARCHAR
created_at          TIMESTAMP
```

Example:

```text
User
|
+-- Cash Wallet
|   +-- IRR
|   +-- GOLD_750
|
+-- Credit Wallet
|   +-- IRR
|   +-- GOLD_750
|
+-- Collateral Wallet
    +-- GOLD_750
```

---

# 8. wallet_balances

```sql
wallet_balances
----------------
id                  UUID PK
wallet_id           UUID FK
asset_code          VARCHAR
available_amount    NUMERIC(38,18)
locked_amount       NUMERIC(38,18)
updated_at          TIMESTAMP
version             BIGINT
```

Use optimistic locking (`version`) or row-level locking to prevent concurrent credit over-allocation.

---

# 9. collaterals

```sql
collaterals
-----------
id                       UUID PK
user_id                  UUID FK
wallet_id                UUID FK

asset_code               VARCHAR
quantity                 NUMERIC(38,18)
purity                   NUMERIC(10,6)

initial_price             NUMERIC(38,18)
initial_value             NUMERIC(38,18)

current_price             NUMERIC(38,18)
current_value             NUMERIC(38,18)

status                   VARCHAR

frozen_at                TIMESTAMP
released_at              TIMESTAMP

credit_facility_id       UUID
created_at               TIMESTAMP
updated_at               TIMESTAMP
version                  BIGINT
```

Statuses:

```text
REQUESTED
FROZEN
PARTIALLY_USED
LIQUIDATING
RELEASING
RELEASED
SEIZED
CLOSED
```

---

# 10. credit_facilities

A Credit Facility is the user's approved credit contract.

```sql
credit_facilities
-----------------
id                       UUID PK
user_id                  UUID FK
collateral_id            UUID FK

requested_leverage       NUMERIC(10,4)
approved_leverage        NUMERIC(10,4)

initial_collateral_value NUMERIC(38,18)

credit_limit             NUMERIC(38,18)
used_credit              NUMERIC(38,18)
available_credit         NUMERIC(38,18)

initial_margin_rate      NUMERIC(10,8)
maintenance_margin_rate  NUMERIC(10,8)
liquidation_margin_rate  NUMERIC(10,8)

status                   VARCHAR

green_deadline           TIMESTAMP
yellow_deadline          TIMESTAMP
admin_deadline           TIMESTAMP

policy_version           BIGINT

created_at               TIMESTAMP
updated_at               TIMESTAMP
```

Important: Reactivating a closed facility should normally create a new facility version/record rather than mutating the old one back to ACTIVE.

---

# 11. credit_positions

```sql
credit_positions
----------------
id                       UUID PK
user_id                  UUID FK
credit_facility_id       UUID FK

symbol                   VARCHAR

side                     VARCHAR
quantity                 NUMERIC(38,18)

entry_price              NUMERIC(38,18)
mark_price               NUMERIC(38,18)

notional_value           NUMERIC(38,18)

realized_pnl             NUMERIC(38,18)
unrealized_pnl           NUMERIC(38,18)

fees                     NUMERIC(38,18)

initial_margin           NUMERIC(38,18)
maintenance_margin       NUMERIC(38,18)

status                   VARCHAR

opened_at                TIMESTAMP
closed_at                TIMESTAMP

version                  BIGINT
```

Sides:

```text
LONG
SHORT
```

Statuses:

```text
OPEN
REDUCING
MARGIN_CALL
LIQUIDATING
CLOSED
LIQUIDATED
```

---

# 12. orders

```sql
orders
------
id                       UUID PK
user_id                  UUID FK
credit_facility_id       UUID FK
position_id              UUID FK

order_type               VARCHAR
side                     VARCHAR

asset_code               VARCHAR
quantity                 NUMERIC(38,18)

price                    NUMERIC(38,18)
executed_quantity        NUMERIC(38,18)
remaining_quantity       NUMERIC(38,18)

source                   VARCHAR
status                   VARCHAR

client_order_id          VARCHAR
parent_order_id          UUID

created_at               TIMESTAMP
updated_at               TIMESTAMP
```

Order types:

```text
MARKET
LIMIT
LIQUIDATION
```

Sources:

```text
USER
SYSTEM
LIQUIDATION_ENGINE
ADMIN
```

---

# 13. trades

```sql
trades
------
id                  UUID PK
buy_order_id        UUID
sell_order_id       UUID

price               NUMERIC(38,18)
quantity            NUMERIC(38,18)

gross_value         NUMERIC(38,18)
fee                 NUMERIC(38,18)

executed_at         TIMESTAMP
```

---

# 14. Ledger

## ledger_transactions

```sql
ledger_transactions
-------------------
id                  UUID PK
transaction_type    VARCHAR
reference_type      VARCHAR
reference_id        UUID

idempotency_key     VARCHAR UNIQUE

status              VARCHAR

created_at          TIMESTAMP
completed_at        TIMESTAMP
```

## ledger_entries

```sql
ledger_entries
--------------
id                  UUID PK
transaction_id      UUID FK

account_id          UUID
wallet_id           UUID

asset_code          VARCHAR

debit               NUMERIC(38,18)
credit              NUMERIC(38,18)

created_at          TIMESTAMP
```

Every financial transaction must balance for the relevant asset.

---

# 15. Freeze Collateral Flow

Example:

```text
User owns:
100g GOLD_750
```

Freeze:

```text
Cash/Available Gold
    -100g

Collateral Account
    +100g
```

The operation must produce a ledger transaction:

```text
FREEZE_COLLATERAL
```

with immutable audit data.

---

# 16. Credit Wallet Accounting

Example:

User opens a credit position to buy 50g gold at a total value of 500m IRR.

Credit Wallet becomes conceptually:

```text
IRR  = -500m
GOLD = +50g
```

This negative IRR is allowed only within the approved credit exposure.

The user should not be able to withdraw the credit-created asset until the relevant obligation is settled according to the settlement rules.

---

# 17. Core Formulas

## 17.1 Collateral Value

If market price is quoted directly for Gold 750:

```text
Collateral Value
=
Collateral Quantity × Mark Price
```

If market price is for pure gold:

```text
Pure Gold Quantity
=
Quantity × Purity / 1000

Collateral Value
=
Pure Gold Quantity × Pure Gold Mark Price
```

---

## 17.2 Credit Limit

Base formula:

```text
Credit Limit
=
Collateral Value × Approved Leverage
```

Two policy choices exist:

### Static limit

Credit limit is based on the initial collateral valuation.

### Dynamic limit

```text
Dynamic Credit Limit
=
Current Collateral Value × Approved Leverage
```

Dynamic credit limits reduce the user's available exposure as collateral value falls.

---

## 17.3 Position Notional

```text
Position Notional
=
Position Quantity × Mark Price
```

---

## 17.4 Long PnL

```text
Long PnL
=
Quantity × (Mark Price - Entry Price)
```

## 17.5 Short PnL

```text
Short PnL
=
Quantity × (Entry Price - Mark Price)
```

---

## 17.6 Equity

```text
Equity
=
Collateral Value
+ Realized PnL
+ Unrealized PnL
- Fees
- Other Liabilities
```

---

## 17.7 Initial Margin

```text
Initial Margin
=
Position Notional × Initial Margin Rate
```

For 10x leverage:

```text
Initial Margin Rate = 1 / 10 = 10%
```

---

## 17.8 Maintenance Margin

```text
Maintenance Margin
=
Position Notional × Maintenance Margin Rate
```

Example:

```text
Position = 1,000m
Maintenance Rate = 7.5%

Maintenance Margin = 75m
```

---

## 17.9 Margin Ratio

```text
Margin Ratio
=
Equity / Position Notional
```

Example:

```text
Equity = 100m
Position Notional = 1,000m

Margin Ratio = 10%
```

---

# 18. Recommended Risk Thresholds

All values must be configurable per risk policy.

Example starting policy:

```text
Initial Margin Rate       = 10%
Maintenance Margin Rate   = 7.5%
Liquidation Margin Rate   = 5%
Emergency Loss Limit      = 90% of initial collateral
```

Rules:

```text
IF Margin Ratio <= Maintenance Margin Rate
    => MARGIN_CALL

IF Margin Ratio <= Liquidation Margin Rate
    => LIQUIDATION

IF Equity <= Initial Collateral × 10%
    => FORCE LIQUIDATION / EMERGENCY LIMIT
```

The 90% loss rule should be treated as a hard safety limit rather than the only liquidation criterion.

---

# 19. Risk State Machine

```text
NORMAL
  |
  +--> WARNING
          |
          +--> MARGIN_CALL
                    |
                    +--> REDUCING
                    |
                    +--> LIQUIDATING
                              |
                              +--> LIQUIDATED
                              |
                              +--> SETTLED
                              |
                              +--> DEFAULT
```

Recommended behavior:

### NORMAL
- Open positions allowed
- Increase position allowed

### WARNING
- Risk notification
- Optionally restrict new exposure

### MARGIN_CALL
- No new exposure
- Reduce-only allowed
- User must improve collateral/equity or reduce position

### REDUCING
- Position may only be reduced

### LIQUIDATING
- System owns the liquidation process
- User cannot increase exposure

### LIQUIDATED
- Position closed through liquidation

### SETTLED
- Obligations resolved

### DEFAULT
- Residual debt remains after allowed collateral is consumed

---

# 20. Settlement Timer State Machine

```text
GREEN
  |
  v
YELLOW
  |
  v
RED
  |
  v
ADMIN_REVIEW
  |
  v
AUTO_LIQUIDATION
  |
  v
SETTLED
```

Example configurable windows:

```text
GREEN   = T0 → T+8h
YELLOW  = T+8h → T+12h
RED     = T+12h → T+16h
ADMIN   = T+16h
```

These are examples only and must be policy-configurable.

Timers must be backend-controlled, not frontend-only.

---

# 21. Settlement and Risk Must Be Independent

Example:

```text
Risk State       = NORMAL
Settlement State = RED
```

This means the position is financially healthy but the settlement deadline is approaching.

Conversely:

```text
Risk State       = MARGIN_CALL
Settlement State = GREEN
```

means the user has time remaining but insufficient risk capacity.

---

# 22. Liquidation Process

When the liquidation threshold is breached:

```text
1. Freeze new orders
2. Lock Credit Facility
3. Lock Position
4. Read fresh Mark Price
5. Recalculate PnL
6. Recalculate Equity
7. Verify liquidation condition
8. Create LIQUIDATION order
9. Execute/reconcile liquidation
10. Calculate realized PnL
11. Calculate fees
12. Deduct applicable loss from collateral
13. Settle Credit Wallet obligations
14. Release remaining collateral
15. Close Position
16. Close Credit Facility
17. Emit events
18. Write audit record
```

---

# 23. Liquidation Must Be Idempotent

Use:

```text
LIQUIDATION:{position_id}:{liquidation_version}
```

as a unique idempotency key.

Repeated events must not create duplicate liquidation orders.

---

# 24. Partial Liquidation

Recommended future capability:

Instead of always closing the entire position:

```text
Position = 100g
```

Liquidation engine may first close:

```text
25g
```

then recalculate:

```text
Equity
Margin Ratio
Position Notional
```

and continue until the account is above the required risk threshold.

This is preferable where market liquidity allows it.

---

# 25. Reduce-Only

When in Yellow/Warning or Margin Call:

```text
allow_open_new_position = false
allow_increase_position = false
allow_reduce_position = true
```

This gives the user a path to recover risk without increasing exposure.

---

# 26. Mark Price

Risk must use a dedicated Mark Price rather than blindly using the last traded price.

Suggested market-price table:

```sql
market_prices
-------------
id
symbol
bid
ask
last
mark_price
source
timestamp
sequence
```

The exact Mark Price methodology must be formally specified before production.

---

# 27. Market Data Failure Policy

The Risk Engine needs a stale-price policy.

Example:

```text
Price age < 5 sec
    NORMAL

5–30 sec
    WARNING

>30 sec
    NEW CREDIT ORDERS BLOCKED

>60 sec
    EMERGENCY RISK POLICY
```

These thresholds are examples and must be configurable.

---

# 28. Margin Snapshots

```sql
margin_snapshots
----------------
id
user_id
position_id
collateral_value
position_notional
unrealized_pnl
realized_pnl
equity
margin_ratio
maintenance_margin
liquidation_threshold
mark_price
risk_state
created_at
```

Snapshots provide:

- Historical risk analysis
- Dispute resolution
- Admin reporting
- Post-liquidation investigation
- Regulatory/audit support

---

# 29. Admin Actions

```sql
admin_actions
-------------
id
admin_id
user_id
position_id
action
reason
before_state
after_state
created_at
```

Supported actions may include:

```text
VIEW
EXTEND
FORCE_LIQUIDATE
REDUCE_POSITION
SUSPEND_CREDIT
REACTIVATE_CREDIT
CHANGE_CREDIT_LIMIT
```

Direct balance manipulation by admins should be prohibited.

Admin adjustments must create auditable adjustment transactions.

---

# 30. API Surface

## Collateral

```http
POST /credit/collaterals/freeze
GET  /credit/collaterals/{id}
POST /credit/collaterals/{id}/release
```

## Credit

```http
POST /credit/facilities
GET  /credit/facilities/{id}
GET  /credit/facilities/{id}/risk
```

## Orders

```http
POST /credit/orders
GET  /credit/orders/{id}
POST /credit/orders/{id}/cancel
```

## Positions

```http
GET  /credit/positions
GET  /credit/positions/{id}
POST /credit/positions/{id}/reduce
```

## Admin

```http
POST /admin/credit/{id}/suspend
POST /admin/credit/{id}/reactivate
POST /admin/positions/{id}/liquidate
POST /admin/credit/{id}/extend-settlement
```

---

# 31. Create Credit Flow

```text
POST /credit/facilities
        |
        v
Validate User
        |
Validate Collateral
        |
Lock Collateral
        |
Get Mark Price
        |
Calculate Collateral Value
        |
Check Maximum Leverage
        |
Create Credit Facility
        |
Calculate Credit Limit
        |
Create Ledger Transaction
        |
Activate Facility
```

Request example:

```json
{
  "collateral_id": "COL-123",
  "leverage": 10
}
```

---

# 32. Create Order Validation

Before accepting an order:

```text
1. User active?
2. Credit enabled?
3. Credit Facility active?
4. Collateral valid?
5. Settlement deadline valid?
6. Risk state permits increase?
7. Position size within limit?
8. Leverage within limit?
9. Available credit sufficient?
10. Price valid/not stale?
11. Margin after order acceptable?
12. Acquire atomic lock
13. Re-check conditions
14. Create order
```

---

# 33. Concurrency / Race Conditions

Example:

Available credit = 1,000m.

Two concurrent requests each attempt 600m.

Without locking:

```text
Request A sees 1,000m
Request B sees 1,000m

A approves 600m
B approves 600m

Total = 1,200m
```

Solution:

- PostgreSQL row-level locking (`SELECT ... FOR UPDATE`)
- Or optimistic locking using `version`
- Or serialized risk commands per Credit Facility

The system must guarantee:

```text
Used Credit <= Approved Exposure
```

at transaction commit.

---

# 34. Credit Wallet Negative Balance

Negative balances are allowed only inside the Credit Wallet.

Example:

```text
Cash Wallet:
IRR >= 0

Credit Wallet:
IRR may be negative
```

But:

```text
ABS(Negative Credit Balance)
<= Approved Credit Exposure
```

must always hold after successful transaction commit.

---

# 35. Bad Debt Policy

Example:

```text
Collateral = 100m
Liquidation Loss = 120m
```

Business must explicitly select one of:

### Full Recourse

```text
Collateral absorbs 100m
User remains liable for 20m
```

### Limited Recourse

```text
Collateral absorbs 100m
Platform absorbs 20m
```

### Insurance Fund

```text
Collateral absorbs 100m
Insurance Fund absorbs 20m
```

This policy must be defined before production.

---

# 36. Event Model

Recommended events:

```text
COLLATERAL_FREEZE_REQUESTED
COLLATERAL_FROZEN
COLLATERAL_RELEASED

CREDIT_REQUESTED
CREDIT_APPROVED
CREDIT_ACTIVATED
CREDIT_SUSPENDED
CREDIT_CLOSED

ORDER_CREATED
ORDER_FILLED
ORDER_CANCELLED

POSITION_OPENED
POSITION_UPDATED
POSITION_REDUCED
POSITION_CLOSED

PRICE_UPDATED

MARGIN_WARNING
MARGIN_CALL
LIQUIDATION_TRIGGERED
LIQUIDATION_FILLED

COLLATERAL_DEDUCTED

SETTLEMENT_STARTED
SETTLEMENT_WARNING
SETTLEMENT_EXPIRED
SETTLEMENT_COMPLETED

CREDIT_DEFAULTED
```

---

# 37. Example End-to-End Scenario

Assumptions:

```text
Collateral = 100g Gold 750
Collateral Value = 100m IRR
Leverage = 10x
Credit Limit = 1,000m IRR
```

User opens:

```text
LONG 50g
Entry Price = 10m/g
Position Notional = 500m
```

Credit Wallet conceptually:

```text
IRR  = -500m
GOLD = +50g
```

If Mark Price becomes 10.5m:

```text
PnL = 50 × (10.5 - 10)
    = +25m
```

Equity:

```text
100m + 25m = 125m
```

Position Notional:

```text
50 × 10.5 = 525m
```

Margin Ratio:

```text
125 / 525 = ~23.8%
```

Position remains healthy under the example thresholds.

If Mark Price becomes 8m:

```text
PnL = 50 × (8 - 10)
    = -100m
```

Equity approaches zero before fees and other adjustments.

This demonstrates why 10x leverage is highly sensitive to adverse price movement.

---

# 38. Important Product Decision: Static vs Dynamic Credit Limit

Two possible policies:

### Static

```text
Credit Limit = Initial Collateral Value × Leverage
```

Pros:
- Simple
- Predictable

Cons:
- Platform takes more collateral valuation risk

### Dynamic

```text
Credit Limit = Current Collateral Value × Leverage
```

Pros:
- Better risk control
- Automatically reduces exposure capacity when collateral falls

Cons:
- More complex UX
- Available credit can change without a new user order

Recommendation for risk-sensitive production design: **dynamic limit plus hard maximum exposure**.

---

# 39. Recommended Risk Policy Model

All risk parameters must be configurable and versioned:

```text
credit_policies
---------------
id
version

max_leverage
initial_margin_rate
maintenance_margin_rate
liquidation_margin_rate

max_position_value
max_user_exposure
max_asset_exposure

green_duration
yellow_duration
red_duration

liquidation_fee
trading_fee

max_slippage
price_staleness_limit

allow_reduce_only
allow_admin_extension

bad_debt_policy

created_at
activated_at
```

A position/facility must store the `policy_version` used when it was created.

---

# 40. Recommended MVP Scope

## Phase 1

```text
Gold 750 collateral
IRR quote asset
LONG positions
10x maximum leverage
One position per Credit Facility
Market orders
Automatic liquidation
Double-entry ledger
Green/Yellow/Red settlement timer
Admin review
```

## Phase 2

```text
SHORT positions
Multiple positions
Limit orders
Partial liquidation
Reduce-only
Multiple collateral assets
```

## Phase 3

```text
Dynamic leverage
Risk tiers
Cross margin
Portfolio margin
Insurance fund
Advanced exposure controls
```

---

# 41. Production Safety Requirements

Before production launch, the following are mandatory:

- Double-entry ledger
- Immutable audit trail
- Idempotent financial operations
- Row-level/optimistic locking
- Mark-price methodology
- Market-data stale policy
- Liquidation retry/reconciliation mechanism
- Settlement retry/reconciliation mechanism
- Daily ledger reconciliation
- Wallet-vs-ledger reconciliation
- Position-vs-trade reconciliation
- Exposure limits
- Per-user limits
- Per-asset limits
- Admin action audit
- Emergency kill switch
- Credit suspension mechanism
- Bad-debt policy
- Disaster recovery
- Database backups
- Monitoring and alerting

---

# 42. Critical Open Business Decisions

These must be resolved before final implementation:

1. Is Credit Limit static or dynamic?
2. Exact maintenance margin rate?
3. Exact liquidation margin rate?
4. Is the 90% collateral-loss rule a hard emergency limit?
5. Is liquidation full-close or partial liquidation?
6. How is Mark Price calculated?
7. What happens if the market data feed is stale?
8. What is the maximum position size?
9. What is the maximum total exposure per user?
10. What is the maximum total exposure per asset?
11. What happens if liquidation cannot execute because of insufficient liquidity?
12. Who absorbs bad debt?
13. Is there an insurance fund?
14. What are Green/Yellow/Red durations?
15. Can an admin extend settlement?
16. Can a user reduce a position during Red?
17. What fees apply to credit, trading, and liquidation?
18. Can collateral value dynamically change credit capacity?
19. Can a user have multiple Credit Facilities?
20. Can a user use multiple collateral assets?
21. Can credit-created assets be transferred to Cash Wallet before settlement?
22. What happens after default?
23. What conditions allow Super Admin to reactivate credit?
24. Are credit policies versioned and immutable after activation?
25. What regulatory/accounting constraints apply to the jurisdiction and asset?

---

# 43. Recommended Final State Model

```text
                    +----------------+
                    | CREDIT REQUEST |
                    +-------+--------+
                            |
                            v
                       APPROVED
                            |
                            v
                         ACTIVE
                            |
              +-------------+-------------+
              |                           |
              v                           v
           NORMAL                     EXPIRING
              |                           |
              v                           v
           WARNING                   ADMIN REVIEW
              |                           |
              v                           v
         MARGIN CALL                SETTLEMENT
              |                           |
              v                           v
          REDUCING                 AUTO LIQUIDATION
              |                           |
              +-------------+-------------+
                            |
                            v
                       LIQUIDATING
                            |
                 +----------+----------+
                 |                     |
                 v                     v
              SETTLED               DEFAULT
                 |                     |
                 +----------+----------+
                            |
                            v
                          CLOSED
```

---

# 44. Engineering Implementation Priority

Recommended implementation order:

```text
1. Ledger + Account Model
2. Wallets + Balances
3. Collateral Freeze/Release
4. Credit Facility
5. Market Price / Mark Price
6. Order Engine
7. Position Engine
8. Margin Engine
9. Risk State Machine
10. Settlement Timer Engine
11. Liquidation Engine
12. Reconciliation
13. Admin Controls
14. Reporting / Snapshots
15. Advanced risk features
```

Do not start with the UI. The ledger, state machines, and risk formulas should be contractually fixed first.

---

# 45. Final Architecture Recommendation

The core system should be treated as five coordinated engines:

```text
1. Ledger Engine
   Financial truth

2. Credit Engine
   Collateral + credit limits + facilities

3. Trading Engine
   Orders + trades + positions

4. Risk Engine
   Mark price + PnL + equity + margin + exposure

5. Settlement/Liquidation Engine
   Timers + settlement + liquidation + collateral recovery
```

The most important invariant is:

```text
No transaction may create exposure
greater than the user's approved risk capacity.
```

And the most important accounting invariant is:

```text
Every financial state transition must be represented
by an auditable, idempotent, balanced ledger transaction.
```

---

## 46. Immediate Next Deliverables

The next engineering package should contain:

1. PostgreSQL ERD
2. Full PostgreSQL DDL
3. State transition matrix
4. Sequence diagram for Freeze
5. Sequence diagram for Open Position
6. Sequence diagram for Settlement
7. Sequence diagram for Margin Call
8. Sequence diagram for Liquidation
9. REST/OpenAPI specification
10. Event schema specification
11. Risk Engine pseudocode
12. Reconciliation job specification
13. Admin permission matrix
14. Test scenarios and edge cases
15. Load/concurrency test plan

**This document is the functional/technical baseline. The formulas, thresholds, bad-debt policy, Mark Price methodology, and settlement policy remain business decisions until explicitly approved.**
