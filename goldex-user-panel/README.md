# Goldex — Gold Exchange App

A React + Vite authentication and profile application with a luxury gold/obsidian design system.

## Setup

```bash
npm install
npm run dev
```

The app proxies `/api` to `http://localhost:4040` via Vite's dev server config.

## Auth Flow

```
Login  →  phone + password  →  /profile
Register  →  phone  →  OTP (5-digit)  →  complete-registration  →  /profile
```

## Pages

| Route | Description |
|-------|-------------|
| `/login` | Login with phone + password |
| `/register` | Register via OTP flow |
| `/profile` | User profile info |
| `/sessions` | Active devices + login history |
| `/settings` | Language, notifications, security |

## API Endpoints Used

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/v1/auth/send-otp` | No |
| POST | `/api/v1/auth/verify-otp` | No |
| POST | `/api/v1/auth/complete-registration` | Temp token |
| POST | `/api/v1/auth/login` | No |
| GET  | `/api/v1/auth/auth` | Bearer |
| POST | `/api/v1/auth/refresh` | No |
| POST | `/api/v1/auth/logout` | Bearer |
| GET  | `/api/v1/profile/profile` | Bearer |
| GET  | `/api/v1/profile/login` | Bearer |
| GET  | `/api/v1/profile/settings` | Bearer |

## Token Management

- `access_token` and `refresh_token` stored in `localStorage`
- On app load, `/auth/auth` is called to verify the token
- If expired, auto-refresh is attempted via `/auth/refresh`
- `device_id` stored for logout targeting

## Design System

- **Display font**: Cormorant Garamond (serif, luxury feel)
- **Body font**: DM Sans (clean, readable)
- **Theme**: Deep obsidian backgrounds with warm gold accents
- **Primary color**: `#d4a843` (gold)
- **Background**: `#0d0c0a` (near-black obsidian)
