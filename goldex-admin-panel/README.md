# Goldex Admin Panel

Vite + React + TypeScript back-office for Goldex. Talks only to `goldex-backend`
(JWT-secured); no separate BFF. Charts use Chart.js (`react-chartjs-2`). RTL Persian.

## Run

```bash
npm install
npm run dev      # http://localhost:5190  (Vite proxies /api -> backend)
npm run build    # tsc + production bundle
```

Backend URL defaults to `http://localhost:4040` (override with `VITE_BACKEND_URL`).

## Login

Admins authenticate by **mobile + OTP** (Kavenegar). Enter the mobile number of a
provisioned admin → receive a 5-digit code → verify. In a non-production backend
(`NODE_ENV!=production`) the code `12345` is accepted as a dev bypass.

Provision an admin from the **مدیران (Admins)** page (mobile + role) — no password.

## Features

- **داشبورد / Dashboard** — system profit per asset, profit-over-time chart,
  pending-KYC and active-provider counts, customer balances per asset.
- **مقایسه تأمین‌کنندگان / Compare** — multi-provider price chart for a pair, built
  from the pricing-engine's Redis history via `GET /admin/monitoring/pairs/:id/compare`
  (keyed off `provider_pair_mappings`). Buy / sell / spread, auto-refreshing.
- **احراز هویت / KYC** — pending & all documents, approve / reject.
- **کیف‌پول‌ها / Wallets** — all wallets, balance adjust & freeze.
- **نمادها / جفت‌ارزها / نگاشت** — symbol, pair, and provider-pair-mapping management.
- **مدیران / Admins** — create admins by mobile, suspend, delete.

## Notes

- The provider history shown in the Compare chart comes from the pricing-engine
  Redis, proxied (read-only) by the backend `admin-monitoring` module — the SPA
  never connects to Redis directly.
