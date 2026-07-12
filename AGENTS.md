# Goldex monorepo — agent guide

## Repository structure

Five independent projects (no root workspace, no shared config):

| Directory | Tech | Description |
|-----------|------|-------------|
| `goldex-backend/` | NestJS 11 + TS 6 + PostgreSQL + Redis + RabbitMQ | Core API server. Entrypoint: `src/main.ts`, port **4041** (host) / **3000** (container). |
| `goldex-admin-panel/` | React 18 + TS 5 + Vite 5 | Admin SPA. Dev port **5190**. Proxies `/api` + `/uploads` → `localhost:4040`. |
| `goldex-user-panel/` | React 18 + JS + Vite 5 | Customer SPA. Proxies `/api`, `/socket.io` (ws), `/uploads` → `localhost:4040`. |
| `goldex-pricing-engine/` | NestJS 11 + TS 6 + PostgreSQL + Redis + RabbitMQ | Real-time pricing & arbitrage microservice. Port **3000**. |
| `telegram_monitoring/` | NestJS 11 + TS 5 + MTProto | Telegram gold price monitor. |

Each project has its own `package.json`, `node_modules/`, and config. Run commands inside each project directory.

## Key commands

### Backend, Pricing Engine, Telegram Monitor (NestJS projects)
```bash
npm run start:dev      # watch mode
npm run build          # nest build → dist/
npm run start:prod     # node dist/main
npm test               # Jest (spec files in src/)
npm run lint           # ESLint with --fix
npm run format         # Prettier
```

### Admin panel (React + Vite)
```bash
npm run dev          # vite --host on port 5190
npm run typecheck    # tsconfig --noEmit (always run before build)
npm run build        # tsc -b && vite build
npm run preview      # vite preview (production build)
```

### User panel (React 18 JS + Vite 5)
```bash
npm run dev          # vite --host
npm run build        # vite build
```
User panel uses **`i18next` + `react-i18next`** for en/fa. Language is persisted to `localStorage` key `lang`. Switching to `fa` sets `dir="rtl"` on `<html>`. Locale files are in `src/locales/{en,fa}.json`. A `LangToggle` button lives in the sidebar footer and the mobile bottom-nav menu.

The responsive breakpoint is **900px**: sidebar hides, a fixed bottom nav (`BottomNav.jsx`) appears with 4 primary items + a "More" slide-up for secondary items (verification, sessions, settings, theme, language, logout).

### Pricing engine extras
```bash
npm run mock         # ts-node mock-server/index.ts (standalone mock upstream)
```
Mock server simulates Zaryar (SignalR) and TalaAb (WebSocket) providers — no real credentials needed. Has a control API at `/__mock/*` for failure/load testing. See `mock-server/README.md`.

### Telegram monitor extras
```bash
npm run chart:preview   # ts-node scripts/chart-preview.ts
```

## Architecture essentials

- **Backend ↔ Pricing engine**: pricing engine publishes prices to RabbitMQ exchange `signalr.providers`. Backend consumes from queue `goldex.backend.queue`. Pricing engine uses queue `signalr.providers.queue`.
- **Backend proxies pricing-engine Redis** (read-only) for admin-monitoring chart data (`GOLDEX_PRICING_REDIS_HOST`).
- **Backend API**: prefix `/api/v1/`, Swagger at `/api-docs` (basic-auth protected).
- **Admin panel** talks only to backend (JWT-secured). No BFF. Backend's `admin-monitoring` module proxies pricing-engine data.
- **Telegram monitor** uses **MTProto** (`telegram` library), not Bot API. Auth as a regular Telegram user. Persian buy/sell semantics are inverted in gold trading context.
- **No CI/CD** in repo (no `.github/workflows`).

## Config & toolchain quirks

- All NestJS projects: `strictNullChecks: false`, `noImplicitAny: false`, `module: commonjs`.
- Backend uses `.eslintrc.js` (CommonJS). Pricing engine & telegram use `eslint.config.mjs` (flat config).
- Backend NestCLI copies `i18n/**/*` and `templates/**/*` as assets to `dist/`.
- TypeScript versions differ: NestJS projects (TS 6), admin panel (TS 5), telegram (TS 5).
- Prettier config differs: backend uses `singleQuote: false`, `trailingComma: "es5"`, `printWidth: 120`. Pricing engine & telegram use `singleQuote: true`, `trailingComma: "all"`.
- Admin panel dev OTP bypass code: `12345`.

## Testing

- All NestJS projects: Jest, test files are `*.spec.ts` inside `src/` alongside source. `rootDir: "src"` in Jest config. No e2e tests implemented (config exists).
- Pricing engine has no spec files yet.
- Telegram has 6 spec files covering parser, formatter, history, persistence, chart, arbitrage.

## Ports

| Service | Internal | Host |
|---------|----------|------|
| Backend | 3000 | 4041 |
| Admin panel | — | 5190 |
| Pricing engine | 3000 | 3000 |
| Backend Redis | 6379 | 6381 |
| Pricing Redis | 6379 | 6380 |
| PostgreSQL | 5432 | 5434 |

*Pricing engine Redis is at `localhost:6380` locally, reachable as `pricing-engine-redis:6379` in Docker.
