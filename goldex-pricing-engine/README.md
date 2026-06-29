# Refactor notes

## What changed

**Separation of concerns** — the original `ProviderService` mixed CRUD,
OTP/login flows, and upstream HTTP calls in one file. It's now split three ways:

| File | Responsibility |
|---|---|
| `provider.service.ts` | Pure CRUD over the `providers` table. No HTTP, no OTP. |
| `otp.service.ts` | New. Owns the two-step phone OTP flow (send → verify) for any provider category. |
| `provider-manage.service.ts` | Runtime lifecycle only — starting/stopping/restarting live SignalR/WebSocket connections. No persistence logic. |

**Hot-reload on auth update** — `OtpService.verifyOtp` now calls
`ProviderManagerService.restartProvider(key)` after saving the new token, so a
freshly-authenticated provider starts streaming immediately instead of
requiring an app restart. This also fixed a pre-existing bug where
`restartProvider` called `findOne(key)` (which expects a UUID `id`, not a
`key`) — added `ProviderService.findByKey()` and use that instead.

**Removed**
- The ~150 lines of hardcoded provider configs (with live tokens) inside
  `ProviderManagerService.loadConfigurations()`. That method was dead code —
  nothing called it — and it leaked credentials into source control. Provider
  configuration is exclusively DB-driven via `ProviderService`/`POST /providers`
  now.
- Duplicate/conflicting `ProviderConfig` and `IRealtimePriceProvider`
  declarations in `realtime-provider.interface.ts` (the file declared each
  twice; TypeScript was silently using the second).
- Commented-out dead imports (`TalaAbWebSocketProvider` was commented out in
  the module but used in the manager).

**Fixed route ordering bug** — `@Get(':id')` was declared before the static
routes `all-prices`, `integrated-prices`, `market-map`, `consolidated-market`.
Express/Nest matches routes top-down, so any request to those paths was being
swallowed by `findOne(':id')` and returning 404s instead of market data.
Static routes now come first.

**DTOs** — added `SendOtpDto` (validates `mobile` against an Iranian phone
pattern) and `VerifyOtpDto`. Consolidated all provider DTOs into one
`dto/provider.dto.ts` file since they're small and tightly related — adjust
back to separate files if your team's convention prefers one-class-per-file.

## New API surface

```
POST   /providers                     create a provider (no auth yet)
GET    /providers                     list
GET    /providers/:id                 get one
PATCH  /providers/:id                 update
PATCH  /providers/:id/toggle-active   enable/disable
DELETE /providers/:id                 delete

POST   /providers/:id/otp/send        { "mobile": "09123456789" }
POST   /providers/:id/otp/verify      { "otp": "12345" }
```

Typical flow for onboarding a new provider:

1. `POST /providers` with `key`, `category` (`zaryar` | `talaab`), `baseUrl`.
   Leave `auth` empty or include non-secret fields like `shopkeeperId`/`sessionId`
   for `zaryar`. Provider is created `active: true` but won't have a live
   connection yet since `onModuleInit` already ran — call refresh after OTP
   verification, which happens automatically.
2. `POST /providers/:id/otp/send` with the account's mobile number — triggers
   the upstream SMS.
3. `POST /providers/:id/otp/verify` with the received code — stores the token
   in `auth`, then immediately starts (or restarts) the live connection.

All existing runtime/status/prices endpoints are unchanged in behavior, just
reordered and using `:providerKey` consistently in their docs to distinguish
from the `:id` (UUID) used in CRUD/OTP routes.

## Not changed

`base-realtime.provider.ts`, `item-metadata.service.ts`, `redis.service.ts`,
`redis.module.ts`, `zaryar-signalr.provider.ts`, `talaab-websocket.provider.ts`,
`app.module.ts`, `main.ts`, and the migration are functionally identical to
your originals (only import paths adjusted where files moved).
