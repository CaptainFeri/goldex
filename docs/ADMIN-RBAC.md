# Admin roles and permissions

## The finding that prompted this

**Before this change, no admin authorization was in effect.** Not "weak" —
absent. Three independent defects, any one of which was sufficient:

1. `AdminRolesGuard` read its metadata with the key `"roles"`. The
   `@AdminRoles(...)` decorator wrote the key `"AdminRoles"`. The guard
   therefore always read `undefined`, treated the route as unrestricted, and
   returned `true`.
2. The guard looked for the caller on `request.user`. The admin auth
   middleware sets `request.admin`. So even with the keys aligned, it had no
   role to compare against.
3. Only 9 of the 37 controllers behind admin authentication applied the guard
   at all, while 21 declared `@AdminRoles(...)` — so most declarations sat on
   controllers with no guard to read them even in principle.

There is one wrinkle worth knowing before you conclude the fix is narrower than
described. A *second* decorator, `Roles`, lives in the guard's own file and does
write the matching `"roles"` key. Exactly one controller uses it
(`admin/pair-mappings`) — and that controller applies only `AdminAuthGuard`,
never `AdminRolesGuard`, so its declarations were inert too, by defect 3 rather
than defect 1. Every controller that did apply the guard used `@AdminRoles`,
hit the key mismatch, and let the request through.

The practical effect: every `@AdminRoles(...)` in the codebase was decorative.
Any authenticated admin — of any role — could call any admin route. This was
confirmed against the running pipeline before anything was changed, not
inferred from reading the code.

Because the decorators looked plausible, this is the kind of defect that
survives review indefinitely. It is worth treating as a security incident for
disclosure purposes even though the fix is routine.

## What replaces it

- `admin_roles` — roles as rows, not as an enum: `slug`, `roleName`,
  `isFixed`, `permissions` (jsonb), plus `wallets` / `configs` / `pairs` /
  `maxCredit` for the trading configuration the role screens edit.
- `admin.role_id` → `admin_roles.id`, `ON DELETE SET NULL`.
- `AdminPermissionsGuard` + `@RequirePermissions(...)` — one decorator, one
  guard, one metadata key, exported from the same module so they cannot drift
  apart again. The guard reads `request.admin`, combines requirements from the
  handler *and* the controller, and requires all of them.
- The catalog is the 22 keys the panels already use, unchanged.

The `superAdmin` role is the root: the guard grants it the whole catalog by
definition and never reads its stored `permissions` column, and the service
refuses to edit it at all. That is the lock-out guard — there is always one
role that cannot be edited into uselessness.

### The three invariants

Enforced on every role write, fixed role or not:

1. You cannot remove `roles_manage` from your own role.
2. You cannot grant a permission your own role lacks. Without this, anyone
   holding `roles_manage` could mint themselves the full catalog by proxy and
   the permission set would mean nothing.
3. At least one active, unsuspended admin must retain `roles_manage`.
   A suspended admin does not count as a keeper.

## Rollout: this changes behaviour

Enforcement is real now, so calls that previously succeeded can start failing
with 403. Specifically:

- Migration 097 backfills every existing admin from the legacy `role` value,
  so **no existing operator loses access on deploy**. This was verified with
  one admin per legacy value against a real database.
- An admin whose `role_id` is null — created outside the migration, or whose
  role row was deleted — holds **no** permissions and is refused on every
  enforced route. The guard fails closed. Check for these before deploying:

  ```sql
  SELECT id, email, role FROM admin WHERE role_id IS NULL;
  ```

- Suspended admins are refused on enforced routes regardless of role.

## Enforcement coverage

Enforcement is opt-in per controller: a controller without
`AdminPermissionsGuard` in its `@UseGuards` is unaffected. This change applies
it to the four controllers added in this workstream and leaves the rest alone,
because assigning a permission to a legacy route is a product decision about
who should be able to do what — not a mechanical rename, and not something to
land 250 routes of on inference.

The table below is the worklist for that sweep. "Inert `@AdminRoles`" counts
decorators that currently do nothing; they are the best available evidence of
original intent, and should be read before choosing a key. **The suggested keys
are a starting point for that conversation, not a decision.**

<!-- 31 admin controllers, 295 routes; 38 enforced -->

| Controller | Routes | Enforced | Inert `@AdminRoles` | Suggested key |
| --- | ---: | :---: | ---: | --- |
| `admin/accounting` | 12 | **yes** | 0 | already applied |
| `admin` | 11 | **yes** | 0 | already applied |
| `admin/reports` | 9 | **yes** | 0 | already applied |
| `admin/dashboard` | 6 | **yes** | 0 | already applied |
| `admin/credits` | 36 | no | 36 | `wallets_ops` |
| `admin/crm` | 36 | no | 0 | `users_view` |
| `admin/warehouse` | 28 | no | 0 | `warehouse` |
| `admin/pair` | 15 | no | 15 | `trades_manage` |
| `admin/users` | 12 | no | 0 | `users_view` |
| `admin/discounts` | 10 | no | 0 | `trades_manage` |
| `admin/financial` | 9 | no | 9 | `accounting` |
| `admin/p2p` | 9 | no | 9 | `withdrawals_view` |
| `admin/symbols` | 9 | no | 9 | `trades_manage` |
| `admin/kyc` | 8 | no | 7 | `kyc_view` / `kyc_approve` |
| `admin/monitoring` | 8 | no | 1 | `monitoring` |
| `admin/pair-mappings` | 8 | no | 0 | `providers` |
| `admin/user-levels` | 8 | no | 0 | `users_edit` |
| `admin/wallets` | 7 | no | 7 | `wallets_view` / `wallets_ops` |
| `admin/accounts` | 6 | no | 6 | `accounting` |
| `admin/bank-accounts` | 6 | no | 6 | `accounting` |
| `admin/orders` | 6 | no | 0 | `trades_view` |
| `admin/notifications` | 5 | no | 0 | `monitoring` |
| `admin/notifications/templates` | 5 | no | 0 | **needs a decision** |
| `admin/withdraw` | 5 | no | 5 | `withdrawals_view` |
| `admin/cbp` | 4 | no | 4 | `accounting` |
| `admin/provider-finance` | 4 | no | 1 | **needs a decision** |
| `admin/schedules` | 4 | no | 4 | **needs a decision** |
| `admin/auth` | 3 | no | 0 | **needs a decision** |
| `admin/deposit` | 3 | no | 3 | **needs a decision** |
| `admin/finance-logs` | 2 | no | 2 | `accounting` |
| `admin/market` | 1 | no | 0 | none — panel chrome, deliberate |

Until a controller appears with **yes** above, its routes are reachable by any
authenticated admin. The permission-aware sidebar hides pages an operator lacks
the key for, but that is presentation only — an unenforced route is still
reachable by URL. Do not treat the sidebar as an access control.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/admin/permissions` | `roles_view` |
| GET | `/admin/me/permissions` | none — see below |
| GET | `/admin/roles` | `roles_view` |
| GET | `/admin/roles/stats` | `roles_view` |
| GET | `/admin/roles/:id` | `roles_view` |
| GET | `/admin/roles/:id/members` | `roles_view` |
| GET | `/admin/roles/:id/permissions` | `roles_view` |
| POST | `/admin/roles` | `roles_manage` |
| PATCH | `/admin/roles/:id` | `roles_manage` |
| PUT | `/admin/roles/:id/permissions` | `roles_manage` |
| DELETE | `/admin/roles/:id` | `roles_manage` |

`GET /admin/me/permissions` deliberately requires no permission: an operator
must always be able to discover their own access, or the panel cannot decide
what to render and shows an empty shell.

Each role carries `capabilities` (`canDelete` / `canRename` /
`canEditPermissions` / `canEditConfig`), computed server-side from the caller's
own permissions and the role's state. The panel disables controls from it, so a
greyed-out button and a 403 always agree.

## Notes for whoever picks this up

- **The seed in migration 097 is written out literally and must stay that way.**
  A migration is a historical record; if it imported the catalog, an install
  seeded next year would receive different rows than one seeded today, and the
  two environments would quietly disagree about what `admin` can do.
  `seed-roles.spec.ts` asserts the seeded keys are a *subset* of the catalog —
  it deliberately does not assert equality, so the catalog can still grow.
- Role slugs are generated server-side, never taken from the request; code keys
  off them and a caller-chosen slug could collide with a fixed role's.
- Deletion is a soft delete, and the unique index on `slug` still holds the
  soft-deleted row — so slug generation looks at deleted rows too. Without
  that, creating a role, deleting it and creating it again fails at the
  database.
- The legacy `admin.role` column is intentionally still present and still
  written; several places outside this change read it. It is now the legacy
  identity only. Removing it is a separate change, and should come after the
  sweep above is finished.
